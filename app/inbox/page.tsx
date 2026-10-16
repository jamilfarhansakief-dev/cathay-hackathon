"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getChatWindow } from "@/lib/chatWindow";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/components/AuthProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";

type Chat = {
  id: string;
  flightCode: string;
  members: string[];
  memberNames: Record<string, string>;
  requesterUid: string;
  status: "pending" | "accepted" | "declined" | "ended" | "blocked";
  lastMessage?: string;
  lastMessageAt?: Timestamp | null;
};

type FlightTimes = {
  departureTime?: Timestamp;
  landingTime?: Timestamp;
};

export default function InboxPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const [chats, setChats] = useState<Chat[]>([]);
  const [chatsLoaded, setChatsLoaded] = useState(false);
  const [flightTimes, setFlightTimes] = useState<Record<string, FlightTimes>>(
    {}
  );
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  // If not logged in, go to the signup page
  useEffect(() => {
    if (!loading && !user) {
      router.push("/signup");
    }
  }, [user, loading, router]);

  // Listen to all of this user's chats
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "chats"),
      where("members", "array-contains", user.uid)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as Chat
        );
        // Newest first
        list.sort(
          (a, b) =>
            (b.lastMessageAt?.toMillis() ?? Number.MAX_SAFE_INTEGER) -
            (a.lastMessageAt?.toMillis() ?? Number.MAX_SAFE_INTEGER)
        );
        setChats(list);
        setChatsLoaded(true);
      },
      (err) => {
        console.error(err);
        setError("Could not load your inbox.");
        setChatsLoaded(true);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // Load the flight times for the flights these chats belong to
  useEffect(() => {
    const codes = Array.from(new Set(chats.map((c) => c.flightCode))).filter(
      (c) => !(c in flightTimes)
    );
    if (codes.length === 0) return;

    async function loadTimes() {
      const results: Record<string, FlightTimes> = {};
      for (const c of codes) {
        try {
          const snap = await getDoc(doc(db, "flights", c));
          results[c] = snap.exists() ? (snap.data() as FlightTimes) : {};
        } catch (err) {
          console.error(err);
          results[c] = {};
        }
      }
      setFlightTimes((prev) => ({ ...prev, ...results }));
    }

    loadTimes();
  }, [chats, flightTimes]);

  function isWindowClosed(chat: Chat) {
    const t = flightTimes[chat.flightCode];
    if (!t?.departureTime || !t?.landingTime) return false;
    return getChatWindow(t.departureTime, t.landingTime).status === "closed";
  }

  async function respond(chat: Chat, status: "accepted" | "declined") {
    setBusyId(chat.id);
    setError("");
    try {
      await updateDoc(doc(db, "chats", chat.id), { status });
    } catch (err) {
      console.error(err);
      setError("Something went wrong. Please try again.");
    }
    setBusyId("");
  }

  if (loading || !user) {
    return null;
  }

  function otherName(chat: Chat) {
    const otherUid = chat.members.find((m) => m !== user!.uid) ?? "";
    return chat.memberNames?.[otherUid] ?? "Traveller";
  }

  const incoming = chats.filter(
    (c) => c.status === "pending" && c.requesterUid !== user.uid
  );
  const sent = chats.filter(
    (c) => c.status === "pending" && c.requesterUid === user.uid
  );
  const active = chats.filter((c) => c.status === "accepted");
  const inactive = chats.filter(
    (c) =>
      c.status === "declined" || c.status === "ended" || c.status === "blocked"
  );

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-3xl p-6">
        <Link href="/dashboard" className="text-sm underline">
          ← Back to dashboard
        </Link>
        <h1 className="mt-4 text-2xl font-semibold">Inbox</h1>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        {!chatsLoaded && <p className="mt-6">Loading...</p>}
        {chatsLoaded && chats.length === 0 && (
          <p className="mt-6 text-muted-foreground">
            No messages yet. Open a flight room and send someone a message.
          </p>
        )}

        {incoming.length > 0 && (
          <section className="mt-6 grid gap-3">
            <h2 className="font-semibold">Requests for you</h2>
            {incoming.map((chat) => {
              const closed = isWindowClosed(chat);
              return (
                <Card key={chat.id}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      {otherName(chat)}
                      {closed && <Badge variant="secondary">Closed</Badge>}
                    </CardTitle>
                    <CardDescription>Flight {chat.flightCode}</CardDescription>
                  </CardHeader>
                  <CardContent className="text-sm">
                    {chat.lastMessage}
                  </CardContent>
                  <CardFooter className="gap-2">
                    {closed ? (
                      <p className="text-sm text-muted-foreground">
                        The chat window for this flight has ended.
                      </p>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          disabled={busyId === chat.id}
                          onClick={() => respond(chat, "accepted")}
                        >
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === chat.id}
                          onClick={() => respond(chat, "declined")}
                        >
                          Decline
                        </Button>
                      </>
                    )}
                  </CardFooter>
                </Card>
              );
            })}
          </section>
        )}

        {active.length > 0 && (
          <section className="mt-6 grid gap-3">
            <h2 className="font-semibold">Conversations</h2>
            {active.map((chat) => (
              <Link key={chat.id} href={`/inbox/${chat.id}`}>
                <Card className="transition-shadow hover:shadow-md">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      {otherName(chat)}
                      {isWindowClosed(chat) && (
                        <Badge variant="secondary">Closed</Badge>
                      )}
                    </CardTitle>
                    <CardDescription>Flight {chat.flightCode}</CardDescription>
                  </CardHeader>
                  <CardContent className="truncate text-sm text-muted-foreground">
                    {chat.lastMessage}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </section>
        )}

        {sent.length > 0 && (
          <section className="mt-6 grid gap-3">
            <h2 className="font-semibold">Sent requests</h2>
            {sent.map((chat) => (
              <Link key={chat.id} href={`/inbox/${chat.id}`}>
                <Card className="transition-shadow hover:shadow-md">
                  <CardHeader>
                    <CardTitle>{otherName(chat)}</CardTitle>
                    <CardDescription>
                      Flight {chat.flightCode} · Waiting for a reply
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-sm">
                    {chat.lastMessage}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </section>
        )}

        {inactive.length > 0 && (
          <section className="mt-6 grid gap-3">
            <h2 className="font-semibold">Closed conversations</h2>
            {inactive.map((chat) => (
              <Link key={chat.id} href={`/inbox/${chat.id}`}>
                <Card className="transition-shadow hover:shadow-md">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      {otherName(chat)}
                      <Badge variant="secondary">Closed</Badge>
                    </CardTitle>
                    <CardDescription>Flight {chat.flightCode}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </section>
        )}
      </main>
    </>
  );
}