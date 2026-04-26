import HomeClient from "./page-client";

function generateRoomId() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export default function Home() {
  return <HomeClient initialRoomId={generateRoomId()} />;
}
