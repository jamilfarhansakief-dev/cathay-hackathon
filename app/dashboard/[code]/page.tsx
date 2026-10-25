"use client";

import { useEffect, useState, FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  generateMatchRankingsForUser,
  type CompatibilityMatch,
} from "@/lib/matching";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getChatWindow } from "@/lib/chatWindow";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/components/AuthProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type Flight = {
  flightNumber: string;
  origin: string;
  destination: string;
  departureTime?: Timestamp;
  landingTime?: Timestamp;
};

type Passenger = {
  uid: string;
  name: string;
  travellerType?: string;
  connectReasons?: string[];
  personality?: string;
  interests?: string[];
  stayAwake?: string;
  visibility?: {
    travellerType?: boolean;
    connectReasons?: boolean;
    personality?: boolean;
    interests?: boolean;
    stayAwake?: boolean;
  };
};

type Chat = {
  id: string;
  flightCode: string;
  members: string[];
  requesterUid: string;
  status: "pending" | "accepted" | "declined" | "ended" | "blocked";
};

function PassengerCard({
  passenger,
  isYou,
  messageArea,
}: {
  passenger: Passenger;
  isYou: boolean;
  messageArea?: React.ReactNode;
}) {
  const v = passenger.visibility ?? {};

  const showType = v.travellerType && passenger.travellerType;
  const showReasons =
    v.connectReasons &&
    passenger.connectReasons &&
    passenger.connectReasons.length > 0;
  const showPersonality = v.personality && passenger.personality;
  const showInterests =
    v.interests && passenger.interests && passenger.interests.length > 0;
  const showAwake = v.stayAwake && passenger.stayAwake;

  const nothingShown =
    !showType &&
    !showReasons &&
    !showPersonality &&
    !showInterests &&
    !showAwake;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {passenger.name}
          {isYou && <Badge>You</Badge>}
        </CardTitle>
        {showType && (
          <CardDescription>{passenger.travellerType}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        {showPersonality && (
          <div>
            <p className="text-xs text-muted-foreground">Personality</p>
            <p>{passenger.personality}</p>
          </div>
        )}

        {showAwake && (
          <div>
            <p className="text-xs text-muted-foreground">Staying awake?</p>
            <p>{passenger.stayAwake}</p>
          </div>
        )}

        {showReasons && (
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Here to</p>
            <div className="flex flex-wrap gap-1">
              {passenger.connectReasons!.map((r) => (
                <Badge key={r} variant="secondary">
                  {r}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {showInterests && (
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Interests</p>
            <div className="flex flex-wrap gap-1">
              {passenger.interests!.map((i) => (
                <Badge key={i} variant="outline">
                  {i}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {nothingShown && (
          <p className="text-muted-foreground">
            {isYou
              ? "You're not sharing any details."
              : "This passenger is keeping their details private."}
          </p>
        )}
      </CardContent>
      {messageArea && <CardFooter>{messageArea}</CardFooter>}
    </Card>
  );
}

export default function FlightRoomPage() {
  const router = useRouter();
  const params = useParams();
  const { user, loading } = useAuth();

  const code = String(params.code).toUpperCase();
  const [matchRankings, setMatchRankings] = useState<CompatibilityMatch[]>([]);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [flightStatus, setFlightStatus] = useState<
    "loading" | "found" | "notfound"
  >("loading");
  const [passengers, setPassengers] = useState<Passenger[]>([]);
  const [passengersLoaded, setPassengersLoaded] = useState(false);
  const [chats, setChats] = useState<Chat[]>([]);
  const [error, setError] = useState("");

  // Message dialog state
  const [target, setTarget] = useState<Passenger | null>(null);
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");

  // If not logged in, go to the signup page
  useEffect(() => {
    if (!loading && !user) {
      router.push("/signup");
    }
  }, [user, loading, router]);

  // Load the flight details
  useEffect(() => {
    if (!user) return;

    async function loadFlight() {
      try {
        const snapshot = await getDoc(doc(db, "flights", code));
        if (snapshot.exists()) {
          setFlight(snapshot.data() as Flight);
          setFlightStatus("found");
        } else {
          setFlightStatus("notfound");
        }
      } catch (err) {
        console.error(err);
        setError("Could not load this flight room.");
        setFlightStatus("notfound");
      }
    }

    loadFlight();
  }, [user, code]);

  // Listen to the passengers live
  useEffect(() => {
    if (!user) return;

    const unsubscribe = onSnapshot(
      collection(db, "flights", code, "passengers"),
      (snapshot) => {
        const list = snapshot.docs.map((d) => d.data() as Passenger);
        setPassengers(list);
        setPassengersLoaded(true);
      },
      (err) => {
        console.error(err);
        setError("Could not load passengers.");
        setPassengersLoaded(true);
      }
    );

    return () => unsubscribe();
  }, [user, code]);

  // Listen to this user's chats, then keep only the ones for this flight
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "chats"),
      where("members", "array-contains", user.uid)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }) as Chat)
          .filter((c) => c.flightCode === code);
        setChats(list);
      },
      (err) => console.error(err)
    );

    return () => unsubscribe();
  }, [user, code]);

  // If this user hasn't joined this room, send them back to the dashboard
  useEffect(() => {
    if (
      user &&
      flightStatus === "found" &&
      passengersLoaded &&
      !passengers.some((p) => p.uid === user.uid)
    ) {
      router.push("/dashboard");
    }
  }, [user, flightStatus, passengersLoaded, passengers, router]);

  // Is the chat window open for this flight?
  const windowInfo =
    flight?.departureTime && flight?.landingTime
      ? getChatWindow(flight.departureTime, flight.landingTime)
      : null;
  const windowStatus = windowInfo?.status ?? "open";

  function openMessageDialog(p: Passenger) {
    setTarget(p);
    setMessageText("");
    setSendError("");
  }

  function closeMessageDialog() {
    setTarget(null);
    setMessageText("");
    setSendError("");
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!user || !target) return;

    const text = messageText.trim();
    if (!text) {
      setSendError("Please write a message.");
      return;
    }

    setSending(true);
    setSendError("");

    try {
      // One chat per pair of passengers per flight
      const [a, b] = [user.uid, target.uid].sort();
      const chatId = `${code}_${a}_${b}`;
      const chatRef = doc(db, "chats", chatId);

      // Never overwrite an existing chat
      const existing = await getDoc(chatRef);
      if (existing.exists()) {
        setSendError("A conversation with this passenger already exists.");
        setSending(false);
        return;
      }

      const batch = writeBatch(db);

      batch.set(chatRef, {
        flightCode: code,
        members: [user.uid, target.uid],
        memberNames: {
          [user.uid]: user.displayName ?? "Traveller",
          [target.uid]: target.name,
        },
        requesterUid: user.uid,
        status: "pending",
        lastMessage: text,
        lastMessageAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      });

      batch.set(doc(collection(db, "chats", chatId, "messages")), {
        senderUid: user.uid,
        text,
        createdAt: serverTimestamp(),
      });

      await batch.commit();
      closeMessageDialog();
    } catch (err) {
      console.error(err);
      setSendError("Could not send your message. Please try again.");
    }
    setSending(false);
  }

  // What to show in the footer of another passenger's card
  function renderMessageArea(p: Passenger) {
    if (!user) return null;

    const chat = chats.find((c) => c.members.includes(p.uid));

    if (chat) {
      if (chat.status === "pending") {
        return chat.requesterUid === user.uid ? (
          <p className="text-sm text-muted-foreground">Request sent ⏳</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            They sent you a message. Check your inbox.
          </p>
        );
      }
      if (chat.status === "accepted") {
        return <p className="text-sm text-muted-foreground">Connected ✅</p>;
      }
      // declined, ended or blocked
      return (
        <p className="text-sm text-muted-foreground">
          Messaging unavailable
        </p>
      );
    }

    if (windowStatus === "not_open_yet" && windowInfo) {
      return (
        <p className="text-sm text-muted-foreground">
          Chat opens {windowInfo.opensAt.toLocaleString()}
        </p>
      );
    }

    if (windowStatus === "closed") {
      return <p className="text-sm text-muted-foreground">Chat closed</p>;
    }

    return (
      <Button size="sm" onClick={() => openMessageDialog(p)}>
        Send message
      </Button>
    );
  }

  if (loading || !user) {
    return null;
  }

  // Your card first, then everyone else
  const sorted = [...passengers].sort((a, b) => {
    if (a.uid === user.uid) return -1;
    if (b.uid === user.uid) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-5xl p-6">
        <Link href="/dashboard" className="text-sm underline">
          ← Back to dashboard
        </Link>

        {flightStatus === "loading" && <p className="mt-6">Loading...</p>}

        {flightStatus === "notfound" && (
          <p className="mt-6">{error || "This flight room doesn't exist."}</p>
        )}

        {flightStatus === "found" && flight && (
          <>
            <h1 className="mt-4 text-2xl font-semibold">
              {flight.flightNumber}: {flight.origin} → {flight.destination}
            </h1>
            <p className="text-sm text-muted-foreground">
              Room code: {code} · {passengers.length}{" "}
              {passengers.length === 1 ? "passenger" : "passengers"}
            </p>

            {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sorted.map((p) => {
                const isYou = p.uid === user.uid;
                return (
                  <PassengerCard
                    key={p.uid}
                    passenger={p}
                    isYou={isYou}
                    messageArea={isYou ? undefined : renderMessageArea(p)}
                  />
                );
              })}
            </div>
          </>
        )}
      </main>

      <Dialog
        open={!!target}
        onOpenChange={(isOpen) => {
          if (!isOpen) closeMessageDialog();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Message {target?.name}</DialogTitle>
            <DialogDescription>
              You can send one message to start. Say why you'd like to talk.
              They can accept or ignore the request, and you can chat once
              they accept.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSend} className="grid gap-3">
            <Textarea
              placeholder="e.g. Hi! We both land in London around the same time. Want to share a cab?"
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              maxLength={500}
              rows={4}
            />
            <p className="text-xs text-muted-foreground">
              Please avoid sharing personal details like your phone number.
            </p>
            {sendError && <p className="text-sm text-red-600">{sendError}</p>}
            <Button type="submit" disabled={sending}>
              {sending ? "Sending..." : "Send request"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
