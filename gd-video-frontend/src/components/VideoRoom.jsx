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
      username: "REPLACE_WITH_YOUR_TURN_USERNAME",
      credential: "REPLACE_WITH_YOUR_TURN_PASSWORD",
    },
  ],
};

export default function VideoRoom({ session }) {
  const { name, roomId } = session;

  const socketRef = useRef(null);
  const peersRef = useRef({});
  const localStreamRef = useRef(null);
  const localVideoRef = useRef(null);

  const [remoteVideos, setRemoteVideos] = useState([]);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [pinnedId, setPinnedId] = useState(null);

  /* ================================
     INIT
  ================================ */
  useEffect(() => {
    init();

    return () => {
      leaveCall(); // cleanup on unmount
    };
  }, []);

  async function init() {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    localStreamRef.current = stream;
    localVideoRef.current.srcObject = stream;

    socketRef.current = new WebSocket(WS_URL);

    socketRef.current.onopen = () => {
      socketRef.current.send(
        JSON.stringify({
          type: "join",
          roomId,
          name,
        })
      );
    };

    socketRef.current.onmessage = async ({ data }) => {
      const msg = JSON.parse(data);

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
        await peersRef.current[msg.from].setRemoteDescription(
          msg.answer
        );
      }

      if (msg.type === "ice") {
        await peersRef.current[msg.from].addIceCandidate(
          msg.candidate
        );
      }

      if (msg.type === "user-left") {
        removePeer(msg.userId);
      }
    };
  }

  /* ================================
     PEER CREATION
  ================================ */
  async function createPeer(userId, initiator) {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peersRef.current[userId] = pc;

    // Add BOTH audio + video tracks
    localStreamRef.current.getTracks().forEach(track => {
      pc.addTrack(track, localStreamRef.current);
    });

    pc.ontrack = event => {
      setRemoteVideos(prev => [
        ...prev.filter(v => v.id !== userId),
        { id: userId, stream: event.streams[0] },
      ]);
    };

    pc.onicecandidate = event => {
      if (event.candidate) {
        socketRef.current.send(
          JSON.stringify({
            type: "ice",
            to: userId,
            candidate: event.candidate,
          })
        );
      }
    };

    if (initiator) {
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
  }

  async function handleOffer({ from, offer }) {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peersRef.current[from] = pc;

    localStreamRef.current.getTracks().forEach(track => {
      pc.addTrack(track, localStreamRef.current);
    });

    pc.ontrack = event => {
      setRemoteVideos(prev => [
        ...prev.filter(v => v.id !== from),
        { id: from, stream: event.streams[0] },
      ]);
    };

    pc.onicecandidate = event => {
      if (event.candidate) {
        socketRef.current.send(
          JSON.stringify({
            type: "ice",
            to: from,
            candidate: event.candidate,
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
  }

  /* ================================
     CONTROLS
  ================================ */

  // 🎙 Mic toggle (SAFE)
  const toggleMic = () => {
    const audioTrack = localStreamRef.current
      .getAudioTracks()[0];
    audioTrack.enabled = !audioTrack.enabled;
    setMicOn(audioTrack.enabled);
  };

  // 🎥 Camera toggle
  const toggleCamera = () => {
    const videoTrack = localStreamRef.current
      .getVideoTracks()[0];
    videoTrack.enabled = !videoTrack.enabled;
    setCamOn(videoTrack.enabled);
  };

  // 🖥 Screen Share (VIDEO ONLY, AUDIO PRESERVED)
  const shareScreen = async () => {
    const screenStream =
      await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });

    const screenTrack = screenStream.getVideoTracks()[0];

    Object.values(peersRef.current).forEach(pc => {
      const sender = pc
        .getSenders()
        .find(s => s.track && s.track.kind === "video");
      sender.replaceTrack(screenTrack);
    });

    screenTrack.onended = () => {
      const camTrack =
        localStreamRef.current.getVideoTracks()[0];
      Object.values(peersRef.current).forEach(pc => {
        const sender = pc
          .getSenders()
          .find(s => s.track && s.track.kind === "video");
        sender.replaceTrack(camTrack);
      });
    };
  };

  /* ================================
     END CALL (LEAVE ROOM)
  ================================ */
  const leaveCall = () => {
    // Close peers
    Object.values(peersRef.current).forEach(pc => pc.close());
    peersRef.current = {};

    // Stop tracks
    localStreamRef.current?.getTracks().forEach(t => t.stop());

    // Notify server
    if (socketRef.current?.readyState === 1) {
      socketRef.current.send(
        JSON.stringify({ type: "leave", roomId })
      );
    }

    socketRef.current?.close();

    // Redirect to lobby
    window.location.reload();
  };

  /* ================================
     UI
  ================================ */
  return (
    <div style={styles.container}>
      <h3>Room: {roomId}</h3>

      <div style={styles.grid}>
        <video
          ref={localVideoRef}
          autoPlay
          muted
          playsInline
          onClick={() => setPinnedId("local")}
          style={styles.video(pinnedId === "local")}
        />

        {remoteVideos.map(v => (
          <video
            key={v.id}
            autoPlay
            playsInline
            ref={el => el && (el.srcObject = v.stream)}
            onClick={() => setPinnedId(v.id)}
            style={styles.video(pinnedId === v.id)}
          />
        ))}
      </div>

      <div style={styles.controls}>
        <button onClick={toggleMic}>
          {micOn ? "Mute Mic" : "Unmute Mic"}
        </button>
        <button onClick={toggleCamera}>
          {camOn ? "Camera Off" : "Camera On"}
        </button>
        <button onClick={shareScreen}>Share Screen</button>
        <button style={styles.endBtn} onClick={leaveCall}>
          End Call
        </button>
      </div>
    </div>
  );
}

/* ================================
   STYLES
================================ */
const styles = {
  container: {
    background: "#000",
    color: "#00ff88",
    minHeight: "100vh",
    padding: "10px",
  },
  grid: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
  },
  video: pinned => ({
    width: pinned ? "600px" : "220px",
    border: pinned ? "3px solid #00ff88" : "1px solid #333",
    cursor: "pointer",
  }),
  controls: {
    marginTop: "10px",
    display: "flex",
    gap: "10px",
  },
  endBtn: {
    background: "red",
    color: "white",
    fontWeight: "bold",
  },
};
