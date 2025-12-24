import { useEffect, useRef, useState } from "react";

const WS_URL = "wss://gd-ai-app.onrender.com/ws";
const ICE = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

export default function VideoRoom({ name, roomId }) {
  const socket = useRef();
  const peers = useRef({});
  const localStream = useRef();
  const localVideo = useRef();
  const audioAnalyser = useRef();

  const [participants, setParticipants] = useState([]);
  const [videos, setVideos] = useState([]);
  const [pinned, setPinned] = useState(null);
  const [transcript, setTranscript] = useState("");

  useEffect(() => {
    init();
    return leave;
  }, []);

  async function init() {
    localStream.current = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    localVideo.current.srcObject = localStream.current;

    setupSpeechRecognition();
    setupSpeakingDetection();

    socket.current = new WebSocket(WS_URL);

    socket.current.onopen = () => {
      socket.current.send(JSON.stringify({ type: "join", roomId, name }));
    };

    socket.current.onmessage = async e => {
      const msg = JSON.parse(e.data);

      if (msg.type === "existing-users") {
        setParticipants(msg.users);
        msg.users.forEach(u => createPeer(u.id, true));
      }

      if (msg.type === "new-user") {
        setParticipants(p => [...p, { id: msg.id, name: msg.name }]);
        createPeer(msg.id, false);
      }

      if (msg.type === "offer") await handleOffer(msg);
      if (msg.type === "answer")
        await peers.current[msg.from].setRemoteDescription(msg.answer);
      if (msg.type === "ice")
        await peers.current[msg.from].addIceCandidate(msg.candidate);

      if (msg.type === "user-left") {
        peers.current[msg.id]?.close();
        delete peers.current[msg.id];
        setVideos(v => v.filter(x => x.id !== msg.id));
        setParticipants(p => p.filter(x => x.id !== msg.id));
      }
    };
  }

  function createPeer(id, initiator) {
    const pc = new RTCPeerConnection(ICE);
    peers.current[id] = pc;

    localStream.current.getTracks().forEach(t =>
      pc.addTrack(t, localStream.current)
    );

    pc.ontrack = e => {
      setVideos(v =>
        [...v.filter(x => x.id !== id), { id, stream: e.streams[0] }]
      );
    };

    pc.onicecandidate = e => {
      if (e.candidate)
        socket.current.send(
          JSON.stringify({ type: "ice", to: id, candidate: e.candidate })
        );
    };

    if (initiator) {
      pc.createOffer().then(o => {
        pc.setLocalDescription(o);
        socket.current.send(
          JSON.stringify({ type: "offer", to: id, offer: o })
        );
      });
    }
  }

  async function handleOffer({ from, offer }) {
    const pc = new RTCPeerConnection(ICE);
    peers.current[from] = pc;

    localStream.current.getTracks().forEach(t =>
      pc.addTrack(t, localStream.current)
    );

    pc.ontrack = e => {
      setVideos(v =>
        [...v.filter(x => x.id !== from), { id: from, stream: e.streams[0] }]
      );
    };

    pc.onicecandidate = e => {
      if (e.candidate)
        socket.current.send(
          JSON.stringify({ type: "ice", to: from, candidate: e.candidate })
        );
    };

    await pc.setRemoteDescription(offer);
    const ans = await pc.createAnswer();
    await pc.setLocalDescription(ans);

    socket.current.send(
      JSON.stringify({ type: "answer", to: from, answer: ans })
    );
  }

  function setupSpeechRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = e => {
      let text = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
      }
      setTranscript(text);
    };

    rec.start();
  }

  function setupSpeakingDetection() {
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    ctx.createMediaStreamSource(localStream.current).connect(analyser);
    audioAnalyser.current = analyser;
  }

  function leave() {
    Object.values(peers.current).forEach(p => p.close());
    localStream.current?.getTracks().forEach(t => t.stop());
    socket.current?.close();
    window.location.reload();
  }

  return (
    <div style={{ background: "#000", color: "#0f0", minHeight: "100vh" }}>
      <h3>Room: {roomId}</h3>

      <div style={{ display: "flex" }}>
        <div style={{ width: "80%", display: "flex", flexWrap: "wrap", gap: 10 }}>
          <video
            ref={localVideo}
            autoPlay
            muted
            onClick={() => setPinned("local")}
            style={{
              width: pinned === "local" ? 600 : 220,
              border: "3px solid #0f0",
            }}
          />

          {videos.map(v => (
            <video
              key={v.id}
              autoPlay
              onClick={() => setPinned(v.id)}
              ref={el => el && (el.srcObject = v.stream)}
              style={{ width: pinned === v.id ? 600 : 220 }}
            />
          ))}
        </div>

        <div style={{ width: "20%", padding: 10 }}>
          <h4>Participants</h4>
          {participants.map(p => (
            <div key={p.id}>{p.name}</div>
          ))}
        </div>
      </div>

      <div style={{ padding: 10, background: "#111", marginTop: 10 }}>
        <strong>Live Transcript:</strong>
        <p>{transcript}</p>
      </div>

      <button
        onClick={leave}
        style={{
          background: "red",
          color: "white",
          padding: "10px 20px",
          marginTop: 10,
        }}
      >
        End Call
      </button>
    </div>
  );
}
