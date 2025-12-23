import { useEffect, useRef, useState } from "react";

/* ================================
   STUN / TURN CONFIG
================================ */
const servers = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" }
    // TURN can be added later
  ],
};

export default function VideoRoom() {
  /* ================================
     REFS
  ================================ */
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerRef = useRef(null);
  const socketRef = useRef(null);
  const localStreamRef = useRef(null);

  /* ================================
     STATE
  ================================ */
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakingTimeMs, setSpeakingTimeMs] = useState(0);
  const [speakingTurns, setSpeakingTurns] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [wordCount, setWordCount] = useState(0);

  /* ================================
     INIT WEBRTC + SOCKET
  ================================ */
  useEffect(() => {
    async function init() {
      /* 1️⃣ Camera + Mic */
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      localVideoRef.current.srcObject = stream;
      localStreamRef.current = stream;

      /* 2️⃣ Peer Connection */
      peerRef.current = new RTCPeerConnection(servers);

      stream.getTracks().forEach(track =>
        peerRef.current.addTrack(track, stream)
      );

      peerRef.current.ontrack = event => {
        remoteVideoRef.current.srcObject = event.streams[0];
      };

      peerRef.current.onicecandidate = event => {
        if (event.candidate) {
          socketRef.current.send(
            JSON.stringify({
              type: "ice",
              candidate: event.candidate,
            })
          );
        }
      };

      /* 3️⃣ WebSocket Signaling */
      socketRef.current = new WebSocket("ws://localhost:8080/ws");

      socketRef.current.onopen = async () => {
        socketRef.current.send(
          JSON.stringify({
            type: "join",
            roomId: "gd-room-1",
          })
        );

        const offer = await peerRef.current.createOffer();
        await peerRef.current.setLocalDescription(offer);

        socketRef.current.send(
          JSON.stringify({
            type: "offer",
            offer,
          })
        );
      };

      socketRef.current.onmessage = async message => {
        const data = JSON.parse(message.data);

        if (data.type === "offer") {
          await peerRef.current.setRemoteDescription(data.offer);
          const answer = await peerRef.current.createAnswer();
          await peerRef.current.setLocalDescription(answer);

          socketRef.current.send(
            JSON.stringify({
              type: "answer",
              answer,
            })
          );
        }

        if (data.type === "answer") {
          await peerRef.current.setRemoteDescription(data.answer);
        }

        if (data.type === "ice") {
          await peerRef.current.addIceCandidate(data.candidate);
        }
      };

      /* 4️⃣ Active Speaker Detection */
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      audioContext
        .createMediaStreamSource(stream)
        .connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let speakingStart = null;

      setInterval(() => {
        analyser.getByteFrequencyData(dataArray);
        const volume = dataArray.reduce((a, b) => a + b, 0);
        const speaking = volume > 3000;

        if (speaking && !isSpeaking) {
          setSpeakingTurns(t => t + 1);
          speakingStart = Date.now();
        }

        if (!speaking && isSpeaking && speakingStart) {
          setSpeakingTimeMs(t => t + (Date.now() - speakingStart));
          speakingStart = null;
        }

        setIsSpeaking(speaking);
      }, 300);

      /* 5️⃣ Live Transcription */
      const SR =
        window.SpeechRecognition || window.webkitSpeechRecognition;

      if (SR) {
        const recognition = new SR();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";

        recognition.onresult = event => {
          let text = "";
          for (let i = event.resultIndex; i < event.results.length; i++) {
            text += event.results[i][0].transcript;
          }

          setTranscript(text);
          setWordCount(text.trim().split(/\s+/).length);
        };

        recognition.start();
      }
    }

    init();
  }, []);

  /* ================================
     END MEETING → AI EVALUATION
  ================================ */
  const endMeeting = async () => {
    const response = await fetch(
      "http://localhost:8080/api/evaluation/report",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: "user1",
          speakingTimeMs,
          speakingTurns,
          wordCount,
          fillerWordCount: 0,
        }),
      }
    );

    const report = await response.json();
    alert(`Final GD Score: ${report.finalScore.toFixed(2)}`);
  };

  /* ================================
     DOWNLOAD PDF REPORT
  ================================ */
  const downloadPdf = async () => {
    const res = await fetch(
      "http://localhost:8080/api/evaluation/report/pdf",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: "user1",
          speakingTimeMs,
          speakingTurns,
          wordCount,
          fillerWordCount: 0,
        }),
      }
    );

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "GD_Report.pdf";
    a.click();
  };

  /* ================================
     UI
  ================================ */
  return (
    <div style={styles.container}>
      <h2 style={styles.title}>GD AI Platform</h2>

      <div style={styles.videoRow}>
        <video
          ref={localVideoRef}
          autoPlay
          muted
          playsInline
          style={{
            ...styles.video,
            border: isSpeaking
              ? "4px solid #00ff88"
              : "4px solid #333",
          }}
        />

        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          style={styles.video}
        />
      </div>

      <div style={styles.transcriptBox}>
        <strong>Live Transcript</strong>
        <p>{transcript}</p>
      </div>

      <div style={styles.controls}>
        <button style={styles.btn} onClick={endMeeting}>
          End Meeting
        </button>
        <button style={styles.btn} onClick={downloadPdf}>
          Download PDF
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
    minHeight: "100vh",
    background: "#0b0b0b",
    color: "#00ff88",
    textAlign: "center",
    paddingTop: "20px",
  },
  title: {
    marginBottom: "20px",
  },
  videoRow: {
    display: "flex",
    justifyContent: "center",
    gap: "20px",
  },
  video: {
    width: "320px",
    height: "240px",
    background: "#000",
    borderRadius: "12px",
  },
  transcriptBox: {
    margin: "20px auto",
    width: "80%",
    background: "#111",
    padding: "12px",
    borderRadius: "8px",
  },
  controls: {
    display: "flex",
    justifyContent: "center",
    gap: "15px",
    marginTop: "10px",
  },
  btn: {
    padding: "10px 18px",
    background: "#00ff88",
    border: "none",
    borderRadius: "6px",
    fontWeight: "bold",
    cursor: "pointer",
  },
};
