import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Lobby({ setSession }) {
  const [name, setName] = useState("");
  const [roomId, setRoomId] = useState("");
  const navigate = useNavigate();

  const joinRoom = () => {
    if (!name.trim() || !roomId.trim()) {
      alert("Please enter your name and room ID");
      return;
    }

    setSession({
      name: name.trim(),
      roomId: roomId.trim(),
    });

    navigate("/room");
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>GD AI Platform</h2>

        <input
          style={styles.input}
          placeholder="Enter your name"
          value={name}
          onChange={e => setName(e.target.value)}
        />

        <input
          style={styles.input}
          placeholder="Enter Room ID"
          value={roomId}
          onChange={e => setRoomId(e.target.value)}
        />

        <button style={styles.btn} onClick={joinRoom}>
          Join Meeting
        </button>

        <p style={styles.hint}>
          Ask the host for the Room ID
        </p>
      </div>
    </div>
  );
}

/* ================================
   STYLES (Piano Black + Green)
================================ */
const styles = {
  container: {
    minHeight: "100vh",
    background: "#0b0b0b",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#00ff88",
  },
  card: {
    width: "320px",
    background: "#111",
    padding: "24px",
    borderRadius: "12px",
    boxShadow: "0 0 20px rgba(0,255,136,0.2)",
    textAlign: "center",
  },
  title: {
    marginBottom: "20px",
  },
  input: {
    width: "100%",
    padding: "10px",
    marginBottom: "12px",
    borderRadius: "6px",
    border: "1px solid #333",
    background: "#000",
    color: "#00ff88",
  },
  btn: {
    width: "100%",
    padding: "10px",
    background: "#00ff88",
    border: "none",
    borderRadius: "6px",
    fontWeight: "bold",
    cursor: "pointer",
  },
  hint: {
    marginTop: "12px",
    fontSize: "12px",
    color: "#aaa",
  },
};
