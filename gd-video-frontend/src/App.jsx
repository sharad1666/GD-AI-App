import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useState } from "react";
import Lobby from "./pages/Lobby";
import VideoRoom from "./pages/VideoRoom";

export default function App() {
  const [session, setSession] = useState(null);

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={<Lobby setSession={setSession} />}
        />
        <Route
          path="/room"
          element={
            session ? (
              <VideoRoom session={session} />
            ) : (
              <Lobby setSession={setSession} />
            )
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
