import { useState } from "react";
import Lobby from "./components/Lobby";
import VideoRoom from "./components/VideoRoom";

function App() {
  const [session, setSession] = useState(null);

  if (!session) {
    return <Lobby onJoin={setSession} />;
  }

  return <VideoRoom session={session} />;
}

export default App;
