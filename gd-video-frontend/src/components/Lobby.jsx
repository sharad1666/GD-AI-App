import { useState } from "react";

export default function Lobby({ onJoin }) {
  const [name, setName] = useState("");
  const [roomId, setRoomId] = useState("");

  const join = () => {
    if (!name || !roomId) {
      alert("Enter name and room ID");
      return;
    }
    onJoin({ name, roomId });
  };

  return (
    <div style={styles.container}>
      <h2>Join Group Discussion</h2>

      <input
        placeholder="Your Name or Email"
        value={name}
        onChange={e => setName(e.target.value)}
        style={styles.input}
      />

      <input
        placeholder="Room ID (e.g. gd-101)"
        value={roomId}
        onChange={e => setRoomId(e.target.value)}
        style={styles.input}
      />

      <button onClick={join} style={styles.btn}>
        Join Room
      </button>
    </div>
  );
}

const styles = {
  container: {
    background: "#000",
    color: "#00ff88",
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    gap: "15px",
  },
  input: {
    padding: "10px",
    width: "250px",
    background: "#111",
    color: "#00ff88",
    border: "1px solid #00ff88",
  },
  btn: {
    padding: "10px 20px",
    background: "#00ff88",
    border: "none",
    cursor: "pointer",
    fontWeight: "bold",
  },
};
