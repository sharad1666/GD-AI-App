import { useEffect, useRef, useState } from "react";

const WS_URL = "wss://gd-ai-app.onrender.com/ws";
const API = "https://gd-ai-app.onrender.com";

const iceServers = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    {
      urls: "turn:global.relay.metered.ca:80",
      username: "REPLACE",
      credential: "REPLACE",
    },
  ],
};

export default function VideoRoom({ session }) {
  const { name, roomId } = session;

  const socket = useRef();
  const peers = useRef({});
  const localStream = useRef();
  const localVideo = useRef();

  const [videos, setVideos] = useState([]);
  const [pinned, setPinned] = useState(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [transcript, setTranscript] = useState("");

  useEffect(() => {
    start();
  }, []);

  async function start() {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    localStream.current = stream;
    localVideo.current.srcObject = stream;

    socket.current = new WebSocket(WS_URL);

    socket.current.onopen = () => {
      socket.current.send(
        JSON.stringify({ type: "join", roomId, name })
      );
    };

    socket.current.onmessage = async ({ data }) => {
      const msg = JSON.parse(data);
      if (msg.type === "existing-users")
        msg.users.forEach(id => createPeer(id, true));
      if (msg.type === "new-user") createPeer(msg.userId, false);
      if (msg.type === "offer") handleOffer(msg);
      if (msg.type === "answer")
        peers.current[msg.from].setRemoteDescription(msg.answer);
      if (msg.type === "ice")
        peers.current[msg.from].addIceCandidate(msg.candidate);
    };

    startTranscription();
  }

  async function createPeer(id, initiator) {
    const pc = new RTCPeerConnection(iceServers);
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
      if (e.candidate) {
        socket.current.send(
          JSON.stringify({ type: "ice", to: id, candidate: e.candidate })
        );
      }
    };

    if (initiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.current.send(
        JSON.stringify({ type: "offer", to: id, offer })
      );
    }
  }

  async function handleOffer({ from, offer }) {
    const pc = new RTCPeerConnection(iceServers);
    peers.current[from] = pc;

    localStream.current.getTracks().forEach(t =>
      pc.addTrack(t, localStream.current)
    );

    pc.ontrack = e => {
      setVideos(v =>
        [...v.filter(x => x.id !== from), { id: from, stream: e.streams[0] }]
      );
    };

    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.current.send(
      JSON.stringify({ type: "answer", to: from, answer })
    );
  }

  /* 🎙 MIC */
  const toggleMic = () => {
    localStream.current.getAudioTracks()[0].enabled = !micOn;
    setMicOn(!micOn);
  };

  /* 🎥 CAMERA */
  const toggleCam = () => {
    localStream.current.getVideoTracks()[0].enabled = !camOn;
    setCamOn(!camOn);
  };

  /* 🖥 SCREEN SHARE */
  const shareScreen = async () => {
    const screen = await navigator.mediaDevices.getDisplayMedia({
      video: true,
    });
    const track = screen.getVideoTracks()[0];
    Object.values(peers.current).forEach(pc => {
      pc.getSenders().find(s => s.track.kind === "video").replaceTrack(track);
    });
    track.onended = () => toggleCam();
  };

  /* 🧠 TRANSCRIPTION */
  const startTranscription = () => {
    const SR =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = true;
    rec.onresult = e => {
      let text = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
      }
      setTranscript(text);
    };
    rec.start();
  };

  return (
    <div style={styles.container}>
      <h3>Room: {roomId}</h3>

      <div style={styles.videoGrid}>
        <video
          ref={localVideo}
          autoPlay
          muted
          onClick={() => setPinned("local")}
          style={styles.video(pinned === "local")}
        />

        {videos.map(v => (
          <video
            key={v.id}
            autoPlay
            playsInline
            ref={el => el && (el.srcObject = v.stream)}
            onClick={() => setPinned(v.id)}
            style={styles.video(pinned === v.id)}
          />
        ))}
      </div>

      <div style={styles.controls}>
        <button onClick={toggleMic}>{micOn ? "Mute" : "Unmute"}</button>
        <button onClick={toggleCam}>{camOn ? "Camera Off" : "Camera On"}</button>
        <button onClick={shareScreen}>Share Screen</button>
      </div>

      <div style={styles.transcript}>
        <strong>Live Transcript</strong>
        <p>{transcript}</p>
      </div>
    </div>
  );
}

const styles = {
  container: {
    background: "#000",
    color: "#00ff88",
    minHeight: "100vh",
    padding: "10px",
  },
  videoGrid: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
  },
  video: pinned => ({
    width: pinned ? "600px" : "200px",
    border: pinned ? "3px solid #00ff88" : "1px solid #333",
    cursor: "pointer",
  }),
  controls: {
    display: "flex",
    gap: "10px",
    marginTop: "10px",
  },
  transcript: {
    marginTop: "10px",
    background: "#111",
    padding: "10px",
  },
};
