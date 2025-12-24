import { useEffect, useRef, useState } from "react";

/* ================================
   CONFIG
================================ */
const WS_URL = "wss://gd-ai-app.onrender.com/ws";

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    {
      urls: "turn:global.relay.metered.ca:80",
      username: "YOUR_TURN_USERNAME",
      credential: "YOUR_TURN_PASSWORD",
    },
  ],
};

export default function VideoRoom({ session }) {
  const { name, roomId } = session;

  const socketRef = useRef(null);
  const peersRef = useRef({});
  const localStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const analyserRef = useRef(null);
  const recognitionRef = useRef(null);

  const [participants, setParticipants] = useState([]);
  const [speakingMap, setSpeakingMap] = useState({});
  const [transcript, setTranscript] = useState("");
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [pinnedId, setPinnedId] = useState(null);

  /* ================================
     INIT
  ================================ */
  useEffect(() => {
    init();
    return () => leaveCall();
  }, []);

  async function init() {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    localStreamRef.current = stream;
    localVideoRef.current.srcObject = stream;

    setupSpeakingDetection(stream);
    setupSpeechRecognition();

    socketRef.current = new WebSocket(WS_URL);

    socketRef.current.onopen = () => {
      socketRef.current.send(
        JSON.stringify({ type: "join", roomId, name })
      );
    };

    socketRef.current.onmessage = async ({ data }) => {
      const msg = JSON.parse(data);

      if (msg.type === "existing-users") {
        setParticipants(msg.users);
        msg.users.forEach(u => createPeer(u.id, true));
      }

      if (msg.type === "new-user") {
        setParticipants(p => [...p, msg.user]);
        createPeer(msg.user.id, false);
      }

      if (msg.type === "offer") handleOffer(msg);

      if (msg.type === "answer") {
        await peersRef.current[msg.from]?.setRemoteDescription(
          msg.answer
        );
      }

      if (msg.type === "ice") {
        await peersRef.current[msg.from]?.addIceCandidate(
          msg.candidate
        );
      }

      if (msg.type === "user-left") removeParticipant(msg.userId);

      if (msg.type === "speaking") {
        setSpeakingMap(prev => ({
          ...prev,
          [msg.userId]: msg.isSpeaking,
        }));
      }
    };
  }

  /* ================================
     SPEECH → TRANSCRIPT
  ================================ */
  function setupSpeechRecognition() {
    const SR =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = e => {
      let text = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
      }

      if (text.trim()) {
        setTranscript(prev => prev + " " + text);

        socketRef.current?.send(
          JSON.stringify({
            type: "transcript",
            roomId,
            userName: name,
            text: text.trim(),
          })
        );
      }
    };

    recognition.onend = () => recognition.start();
    recognition.start();
    recognitionRef.current = recognition;
  }

  /* ================================
     ACTIVE SPEAKER DETECTION
  ================================ */
  function setupSpeakingDetection(stream) {
    const audioCtx = new AudioContext();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;

    audioCtx
      .createMediaStreamSource(stream)
      .connect(analyser);

    analyserRef.current = analyser;
    const data = new Uint8Array(analyser.frequencyBinCount);
    let last = false;

    setInterval(() => {
      analyser.getByteFrequencyData(data);
      const volume = data.reduce((a, b) => a + b, 0);
      const speaking = volume > 2500;

      if (speaking !== last) {
        socketRef.current?.send(
          JSON.stringify({
            type: "speaking",
            roomId,
            isSpeaking: speaking,
          })
        );
        setSpeakingMap(p => ({ ...p, local: speaking }));
        last = speaking;
      }
    }, 300);
  }

  /* ================================
     PEERS
  ================================ */
  async function createPeer(userId, initiator) {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peersRef.current[userId] = pc;

    localStreamRef.current.getTracks().forEach(track =>
      pc.addTrack(track, localStreamRef.current)
    );

    pc.ontrack = e => {
      setParticipants(p =>
        p.map(x =>
          x.id === userId
            ? { ...x, stream: e.streams[0] }
            : x
        )
      );
    };

    pc.onicecandidate = e => {
      if (e.candidate)
        socketRef.current.send(
          JSON.stringify({
            type: "ice",
            to: userId,
            candidate: e.candidate,
          })
        );
    };

    if (initiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socketRef.current.send(
        JSON.stringify({ type: "offer", to: userId, offer })
      );
    }
  }

  async function handleOffer({ from, offer }) {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peersRef.current[from] = pc;

    localStreamRef.current.getTracks().forEach(track =>
      pc.addTrack(track, localStreamRef.current)
    );

    pc.ontrack = e => {
      setParticipants(p =>
        p.map(x =>
          x.id === from
            ? { ...x, stream: e.streams[0] }
            : x
        )
      );
    };

    pc.onicecandidate = e => {
      if (e.candidate)
        socketRef.current.send(
          JSON.stringify({
            type: "ice",
            to: from,
            candidate: e.candidate,
          })
        );
    };

    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socketRef.current.send(
      JSON.stringify({ type: "answer", to: from, answer })
    );
  }

  function removeParticipant(id) {
    peersRef.current[id]?.close();
    delete peersRef.current[id];
    setParticipants(p => p.filter(x => x.id !== id));
  }

  /* ================================
     CONTROLS
  ================================ */
  const toggleMic = () => {
    const t = localStreamRef.current.getAudioTracks()[0];
    t.enabled = !t.enabled;
    setMicOn(t.enabled);
  };

  const toggleCamera = () => {
    const t = localStreamRef.current.getVideoTracks()[0];
    t.enabled = !t.enabled;
    setCamOn(t.enabled);
  };

  const shareScreen = async () => {
    const screenStream =
      await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });

    const screenTrack = screenStream.getVideoTracks()[0];

    Object.values(peersRef.current).forEach(pc => {
      const sender = pc
        .getSenders()
        .find(s => s.track?.kind === "video");
      sender.replaceTrack(screenTrack);
    });

    screenTrack.onended = () => {
      const camTrack =
        localStreamRef.current.getVideoTracks()[0];
      Object.values(peersRef.current).forEach(pc => {
        const sender = pc
          .getSenders()
          .find(s => s.track?.kind === "video");
        sender.replaceTrack(camTrack);
      });
    };
  };

  const leaveCall = () => {
    recognitionRef.current?.stop();
    Object.values(peersRef.current).forEach(pc => pc.close());
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    socketRef.current?.close();
    window.location.reload();
  };

  /* ================================
     UI
  ================================ */
  return (
    <div style={styles.container}>
      <aside style={styles.sidebar}>
        <h4>Participants</h4>
        <ul>
          <li>
            {name} (You){" "}
            {speakingMap.local && <span>🟢</span>}
          </li>
          {participants.map(p => (
            <li key={p.id}>
              {p.name}{" "}
              {speakingMap[p.id] && <span>🟢</span>}
            </li>
          ))}
        </ul>
      </aside>

      <main style={styles.main}>
        <div style={styles.grid}>
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            onClick={() => setPinnedId("local")}
            style={styles.video(
              pinnedId === "local" || speakingMap.local
            )}
          />

          {participants.map(
            p =>
              p.stream && (
                <video
                  key={p.id}
                  autoPlay
                  playsInline
                  ref={el => el && (el.srcObject = p.stream)}
                  onClick={() => setPinnedId(p.id)}
                  style={styles.video(
                    pinnedId === p.id || speakingMap[p.id]
                  )}
                />
              )
          )}
        </div>

        <div style={styles.controls}>
          <button onClick={toggleMic}>
            {micOn ? "Mute" : "Unmute"}
          </button>
          <button onClick={toggleCamera}>
            {camOn ? "Camera Off" : "Camera On"}
          </button>
          <button onClick={shareScreen}>Share Screen</button>
          <button style={styles.endBtn} onClick={leaveCall}>
            End Call
          </button>
        </div>

        <div style={styles.transcript}>
          <strong>Live Transcript</strong>
          <p>{transcript}</p>
        </div>
      </main>
    </div>
  );
}

/* ================================
   STYLES
================================ */
const styles = {
  container: {
    display: "flex",
    height: "100vh",
    background: "#0b0b0b",
    color: "#00ff88",
  },
  sidebar: {
    width: "220px",
    padding: "10px",
    background: "#111",
    borderRight: "1px solid #333",
  },
  main: {
    flex: 1,
    padding: "10px",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "10px",
  },
  video: active => ({
    width: "100%",
    height: active ? "260px" : "200px",
    border: active ? "3px solid #00ff88" : "1px solid #333",
    borderRadius: "10px",
    objectFit: "cover",
    cursor: "pointer",
  }),
  controls: {
    marginTop: "10px",
    display: "flex",
    gap: "10px",
    justifyContent: "center",
  },
  endBtn: {
    background: "red",
    color: "white",
    fontWeight: "bold",
  },
  transcript: {
    marginTop: "10px",
    background: "#111",
    padding: "10px",
    borderRadius: "8px",
    maxHeight: "140px",
    overflowY: "auto",
  },
};
