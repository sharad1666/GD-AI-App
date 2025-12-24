import { useEffect, useRef, useState } from "react";

const WS_URL = "wss://gd-ai-app.onrender.com/ws";

const ICE = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export default function VideoRoom({ name, roomId }) {
  const socket = useRef();
  const peers = useRef({});
  const localStream = useRef();
  const localVideo = useRef();

  const [videos, setVideos] = useState([]);

  useEffect(() => {
    start();
    return leave;
  }, []);

  async function start() {
    localStream.current = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    localVideo.current.srcObject = localStream.current;

    socket.current = new WebSocket(WS_URL);

    socket.current.onopen = () => {
      socket.current.send(
        JSON.stringify({ type: "join", roomId, name })
      );
    };

    socket.current.onmessage = async e => {
      const msg = JSON.parse(e.data);

      if (msg.type === "existing-users") {
        msg.users.forEach(id => createPeer(id, true));
      }

      if (msg.type === "new-user") {
        createPeer(msg.userId, false);
      }

      if (msg.type === "offer") {
        await handleOffer(msg);
      }

      if (msg.type === "answer") {
        await peers.current[msg.from].setRemoteDescription(msg.answer);
      }

      if (msg.type === "ice") {
        await peers.current[msg.from].addIceCandidate(msg.candidate);
      }

      if (msg.type === "user-left") {
        peers.current[msg.userId]?.close();
        delete peers.current[msg.userId];
        setVideos(v => v.filter(x => x.id !== msg.userId));
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
      if (e.candidate) {
        socket.current.send(
          JSON.stringify({ type: "ice", to: id, candidate: e.candidate })
        );
      }
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
      if (e.candidate) {
        socket.current.send(
          JSON.stringify({ type: "ice", to: from, candidate: e.candidate })
        );
      }
    };

    await pc.setRemoteDescription(offer);
    const ans = await pc.createAnswer();
    await pc.setLocalDescription(ans);

    socket.current.send(
      JSON.stringify({ type: "answer", to: from, answer: ans })
    );
  }

  function leave() {
    Object.values(peers.current).forEach(p => p.close());
    localStream.current?.getTracks().forEach(t => t.stop());
    socket.current?.close();
  }

  return (
    <div style={{ background: "#000", minHeight: "100vh", padding: 10 }}>
      <h3 style={{ color: "#0f0" }}>Room: {roomId}</h3>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <video
          ref={localVideo}
          autoPlay
          muted
          style={{ width: 240, border: "2px solid #0f0" }}
        />

        {videos.map(v => (
          <video
            key={v.id}
            autoPlay
            ref={el => el && (el.srcObject = v.stream)}
            style={{ width: 240 }}
          />
        ))}
      </div>

      <button
        onClick={leave}
        style={{ marginTop: 10, background: "red", color: "white" }}
      >
        End Call
      </button>
    </div>
  );
}
