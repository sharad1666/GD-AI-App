import { useEffect, useRef, useState } from "react";

const WS_URL = "wss://gd-ai-app.onrender.com/ws";
const API = "https://gd-ai-app.onrender.com";

/* TURN is REQUIRED for distance users */
const iceServers = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    {
      urls: "turn:global.relay.metered.ca:80",
      username: "REPLACE_WITH_YOURS",
      credential: "REPLACE_WITH_YOURS",
    },
  ],
};

export default function VideoRoom() {
  const localVideo = useRef();
  const socket = useRef();
  const peers = useRef({});
  const streamRef = useRef();

  const [videos, setVideos] = useState([]);
  const roomId =
    new URLSearchParams(window.location.search).get("room") || "gd-1";

  useEffect(() => {
    start();
  }, []);

  async function start() {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    streamRef.current = stream;
    localVideo.current.srcObject = stream;

    socket.current = new WebSocket(WS_URL);

    socket.current.onopen = () => {
      socket.current.send(
        JSON.stringify({ type: "join", roomId })
      );
    };

    socket.current.onmessage = async ({ data }) => {
      const msg = JSON.parse(data);

      if (msg.type === "existing-users") {
        msg.users.forEach(id => createPeer(id, true));
      }

      if (msg.type === "new-user") {
        createPeer(msg.userId, false);
      }

      if (msg.type === "offer") handleOffer(msg);
      if (msg.type === "answer")
        peers.current[msg.from].setRemoteDescription(msg.answer);
      if (msg.type === "ice")
        peers.current[msg.from].addIceCandidate(msg.candidate);
    };
  }

  async function createPeer(id, initiator) {
    const pc = new RTCPeerConnection(iceServers);
    peers.current[id] = pc;

    streamRef.current.getTracks().forEach(t => pc.addTrack(t, streamRef.current));

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

    streamRef.current.getTracks().forEach(t => pc.addTrack(t, streamRef.current));

    pc.ontrack = e => {
      setVideos(v =>
        [...v.filter(x => x.id !== from), { id: from, stream: e.streams[0] }]
      );
    };

    pc.onicecandidate = e => {
      if (e.candidate) {
        socket.current.send(
          JSON.stringify({ type: "ice", to: from, candidate: e.candidate })
        );
      }
    };

    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.current.send(
      JSON.stringify({ type: "answer", to: from, answer })
    );
  }

  return (
    <div style={{ background: "#000", color: "#0f0", minHeight: "100vh" }}>
      <h2>Room: {roomId}</h2>

      <video ref={localVideo} autoPlay muted playsInline width={300} />

      <div style={{ display: "flex", flexWrap: "wrap" }}>
        {videos.map(v => (
          <video
            key={v.id}
            autoPlay
            playsInline
            ref={el => el && (el.srcObject = v.stream)}
            width={300}
          />
        ))}
      </div>
    </div>
  );
}
