import { useEffect, useRef, useState } from "react";

/* ================================
   BACKEND CONFIG
================================ */
const BACKEND_BASE_URL = "https://gd-ai-app.onrender.com";
const WS_URL = "wss://gd-ai-app.onrender.com/ws";

/* ================================
   STUN + TURN (REQUIRED)
   👉 Replace TURN creds later
================================ */
const iceServers = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    {
      urls: "turn:global.relay.metered.ca:80",
      username: "YOUR_TURN_USERNAME",
      credential: "YOUR_TURN_PASSWORD",
    },
  ],
};

export default function VideoRoom() {
  const localVideoRef = useRef(null);
  const socketRef = useRef(null);
  const peersRef = useRef({});
  const localStreamRef = useRef(null);

  const [remoteStreams, setRemoteStreams] = useState([]);
  const [stats, setStats] = useState({
    speakingTimeMs: 0,
    speakingTurns: 0,
    wordCount: 0,
  });

  const roomId =
    new URLSearchParams(window.location.search).get("room") ||
    "default-room";

  /* ================================
     INIT
  ================================ */
  useEffect(() => {
    async function init() {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      localVideoRef.current.srcObject = stream;
      localStreamRef.current = stream;

      socketRef.current = new WebSocket(WS_URL);

      socketRef.current.onopen = () => {
        socketRef.current.send(
          JSON.stringify({ type: "join", roomId })
        );
      };

      socketRef.current.onmessage = async ({ data }) => {
        const msg = JSON.parse(data);

        switch (msg.type) {
          case "existing-users":
            msg.users.forEach(userId =>
              createPeer(userId, true)
            );
            break;

          case "new-user":
            createPeer(msg.userId, false);
            break;

          case "offer":
            await handleOffer(msg);
            break;

          case "answer":
            await peersRef.current[msg.from].setRemoteDescription(
              msg.answer
            );
            break;

          case "ice":
            await peersRef.current[msg.from].addIceCandidate(
              msg.candidate
            );
            break;

          case "user-left":
            removePeer(msg.userId);
            break;

          default:
            break;
        }
      };

      initSpeechTracking(stream);
    }

    init();
  }, []);

  /* ================================
     PEER MANAGEMENT (MESH)
  ================================ */
  const createPeer = async (userId, isInitiator) => {
    const pc = new RTCPeerConnection(iceServers);
    peersRef.current[userId] = pc;

    localStreamRef.current
      .getTracks()
      .forEach(track => pc.addTrack(track, localStreamRef.current));

    pc.ontrack = e => {
      setRemoteStreams(prev => [
        ...prev.filter(s => s.id !== userId),
        { id: userId, stream: e.streams[0] },
      ]);
    };

    pc.onicecandidate = e => {
      if (e.candidate) {
        socketRef.current.send(
          JSON.stringify({
            type: "ice",
            to: userId,
            candidate: e.candidate,
          })
        );
      }
    };

    if (isInitiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socketRef.current.send(
        JSON.stringify({
          type: "offer",
          to: userId,
          offer,
        })
      );
    }
  };

  const handleOffer = async ({ from, offer }) => {
    const pc = new RTCPeerConnection(iceServers);
    peersRef.current[from] = pc;

    localStreamRef.current
      .getTracks()
      .forEach(track => pc.addTrack(track, localStreamRef.current));

    pc.ontrack = e => {
      setRemoteStreams(prev => [
        ...prev.filter(s => s.id !== from),
        { id: from, stream: e.streams[0] },
      ]);
    };

    pc.onicecandidate = e => {
      if (e.candidate) {
        socketRef.current.send(
          JSON.stringify({
            type: "ice",
            to: from,
            candidate: e.candidate,
          })
        );
      }
    };

    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socketRef.current.send(
      JSON.stringify({
        type: "answer",
        to: from,
        answer,
      })
    );
  };

  const removePeer = userId => {
    peersRef.current[userId]?.close();
    delete peersRef.current[userId];
    setRemoteStreams(prev =>
      prev.filter(s => s.id !== userId)
    );
  };

  /* ================================
     SPEECH STATS
  ================================ */
  const initSpeechTracking = stream => {
    const audioCtx = new AudioContext();
    const analyser = audioCtx.createAnalyser();
    audioCtx.createMediaStreamSource(stream).connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);
    let speaking = false;
    let start = 0;

    setInterval(() => {
      analyser.getByteFrequencyData(data);
      const volume = data.reduce((a, b) => a + b, 0);

      if (volume > 3000 && !speaking) {
        speaking = true;
        start = Date.now();
        setStats(s => ({ ...s, speakingTurns: s.speakingTurns + 1 }));
      }

      if (volume <= 3000 && speaking) {
        speaking = false;
        setStats(s => ({
          ...s,
          speakingTimeMs: s.speakingTimeMs + (Date.now() - start),
        }));
      }
    }, 300);

    const SR =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SR) {
      const rec = new SR();
      rec.continuous = true;
      rec.onresult = e => {
        let text = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          text += e.results[i][0].transcript;
        }
        setStats(s => ({
          ...s,
          wordCount: text.trim().split(/\s+/).length,
        }));
      };
      rec.start();
    }
  };

  /* ================================
     END MEETING
  ================================ */
  const endMeeting = async () => {
    await fetch(`${BACKEND_BASE_URL}/api/evaluation/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId, userId: crypto.randomUUID(), ...stats }),
    });
    alert("Meeting ended. Report generated.");
  };

  const downloadPdf = async () => {
    const res = await fetch(
      `${BACKEND_BASE_URL}/api/evaluation/report/pdf`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, userId: "me", ...stats }),
      }
    );
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "GD_Report.pdf";
    a.click();
  };

  /* ================================
     UI
  ================================ */
  return (
    <div style={{ background: "#0b0b0b", color: "#00ff88", minHeight: "100vh" }}>
      <h2>Room: {roomId}</h2>

      <video ref={localVideoRef} autoPlay muted />

      <div style={{ display: "flex", flexWrap: "wrap" }}>
        {remoteStreams.map(s => (
          <video
            key={s.id}
            autoPlay
            playsInline
            ref={v => v && (v.srcObject = s.stream)}
          />
        ))}
      </div>

      <button onClick={endMeeting}>End Meeting</button>
      <button onClick={downloadPdf}>Download PDF</button>
    </div>
  );
}
