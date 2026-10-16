"use client";

import { useEffect, useRef, useState, FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { MoreVertical } from "lucide-react";
import { db } from "@/lib/firebase";
import { getChatWindow } from "@/lib/chatWindow";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Chat = {
  flightCode: string;
  members: string[];
  memberNames: Record<string, string>;
  requesterUid: string;
  status: "pending" | "accepted" | "declined" | "ended" | "blocked";
};

type Message = {
  id: string;
  senderUid: string;
  text: string;
  createdAt: Timestamp | null;
};

type FlightTimes = {
  departureTime?: Timestamp;
  landingTime?: Timestamp;
};

type DialogType = "end" | "block" | "report" | null;

const REPORT_REASONS = [
  "Harassment or abuse",
  "Spam or unwanted solicitation",
  "Inappropriate content",
  "Asking for personal information",
  "Other",
];

export default function ChatPage() {
  const router = useRouter();
  const params = useParams();
  const { user, loading } = useAuth();

  const chatId = String(params.chatId);

  const [chat, setChat] = useState<Chat | null>(null);
  const [chatState, setChatState] = useState<"loading" | "found" | "notfound">(
    "loading"
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [flightTimes, setFlightTimes] = useState<FlightTimes | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // Safety menu state
  const [dialog, setDialog] = useState<DialogType>(null);
  const [working, setWorking] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const [reportReason, setReportReason] = useState("");
  const [reportDetails, setReportDetails] = useState("");
  const [reportSent, setReportSent] = useState(false);

  // If not logged in, go to the signup page
  useEffect(() => {
    if (!loading && !user) {
      router.push("/signup");
    }
  }, [user, loading, router]);

  // Listen to the chat itself
  useEffect(() => {
    if (!user) return;

    const unsubscribe = onSnapshot(
      doc(db, "chats", chatId),
      (snapshot) => {
        if (!snapshot.exists()) {
          setChatState("notfound");
          return;
        }
        const data = snapshot.data() as Chat;
        // Only the two people in the chat may open it
        if (!data.members.includes(user.uid)) {
          router.push("/inbox");
          return;
        }
        setChat(data);
        setChatState("found");
      },
      (err) => {
        console.error(err);
        setChatState("notfound");
      }
    );

    return () => unsubscribe();
  }, [user, chatId, router]);

  // Listen to the messages, oldest first
  useEffect(() => {
    if (!user || chatState !== "found") return;

    const q = query(
      collection(db, "chats", chatId, "messages"),
      orderBy("createdAt", "asc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setMessages(
          snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Message)
        );
      },
      (err) => console.error(err)
    );

    return () => unsubscribe();
  }, [user, chatId, chatState]);

  // Load the flight times to check the chat window
  useEffect(() => {
    if (!chat) return;

    async function loadTimes() {
      try {
        const snap = await getDoc(doc(db, "flights", chat!.flightCode));
        setFlightTimes(snap.exists() ? (snap.data() as FlightTimes) : {});
      } catch (err) {
        console.error(err);
        setFlightTimes({});
      }
    }

    loadTimes();
  }, [chat?.flightCode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to the newest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!user || !chat) return;

    const clean = text.trim();
    if (!clean) return;

    setSending(true);
    setError("");

    try {
      await addDoc(collection(db, "chats", chatId, "messages"), {
        senderUid: user.uid,
        text: clean,
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, "chats", chatId), {
        lastMessage: clean,
        lastMessageAt: serverTimestamp(),
      });
      setText("");
    } catch (err) {
      console.error(err);
      setError("Could not send your message. Please try again.");
    }
    setSending(false);
  }

  function openDialog(type: DialogType) {
    setDialog(type);
    setDialogError("");
    setReportReason("");
    setReportDetails("");
    setReportSent(false);
  }

  function closeDialog() {
    setDialog(null);
    setDialogError("");
  }

  async function handleEnd() {
    if (!user) return;
    setWorking(true);
    setDialogError("");
    try {
      await updateDoc(doc(db, "chats", chatId), {
        status: "ended",
        endedBy: user.uid,
        endedAt: serverTimestamp(),
      });
      closeDialog();
    } catch (err) {
      console.error(err);
      setDialogError("Something went wrong. Please try again.");
    }
    setWorking(false);
  }

  async function handleBlock() {
    if (!user || !chat) return;
    const otherUid = chat.members.find((m) => m !== user.uid);
    if (!otherUid) return;

    setWorking(true);
    setDialogError("");
    try {
      // Close the chat and record the block together
      const batch = writeBatch(db);
      batch.update(doc(db, "chats", chatId), {
        status: "blocked",
        blockedBy: user.uid,
        endedAt: serverTimestamp(),
      });
      batch.set(doc(db, "users", user.uid, "blocks", otherUid), {
        blockedUid: otherUid,
        flightCode: chat.flightCode,
        createdAt: serverTimestamp(),
      });
      await batch.commit();
      closeDialog();
    } catch (err) {
      console.error(err);
      setDialogError("Something went wrong. Please try again.");
    }
    setWorking(false);
  }

  async function handleReport(e: FormEvent) {
    e.preventDefault();
    if (!user || !chat) return;
    const otherUid = chat.members.find((m) => m !== user.uid);
    if (!otherUid) return;

    if (!reportReason) {
      setDialogError("Please choose a reason.");
      return;
    }

    setWorking(true);
    setDialogError("");
    try {
      await addDoc(collection(db, "reports"), {
        chatId,
        flightCode: chat.flightCode,
        reporterUid: user.uid,
        reportedUid: otherUid,
        reason: reportReason,
        details: reportDetails.trim(),
        createdAt: serverTimestamp(),
      });
      setReportSent(true);
    } catch (err) {
      console.error(err);
      setDialogError("Could not submit your report. Please try again.");
    }
    setWorking(false);
  }

  if (loading || !user) {
    return null;
  }

  const otherUid = chat?.members.find((m) => m !== user.uid) ?? "";
  const otherName = chat?.memberNames?.[otherUid] ?? "Traveller";

  const windowStatus =
    flightTimes?.departureTime && flightTimes?.landingTime
      ? getChatWindow(flightTimes.departureTime, flightTimes.landingTime).status
      : "open";

  // What goes at the bottom: the message box, or a notice explaining why not
  function renderBottom() {
    if (!chat) return null;

    if (chat.status === "pending") {
      return (
        <p className="text-sm text-muted-foreground">
          {chat.requesterUid === user!.uid
            ? "Waiting for them to accept your request."
            : "Accept this request from your inbox to reply."}
        </p>
      );
    }

    if (chat.status !== "accepted") {
      return (
        <p className="text-sm text-muted-foreground">
          This conversation is closed. You can read the old messages, but no new
          ones can be sent.
        </p>
      );
    }

    if (windowStatus === "closed") {
      return (
        <p className="text-sm text-muted-foreground">
          This chat is closed. The messaging window for this flight has ended.
        </p>
      );
    }

    if (windowStatus === "not_open_yet") {
      return (
        <p className="text-sm text-muted-foreground">
          Chat for this flight hasn't opened yet.
        </p>
      );
    }

    return (
      <form onSubmit={handleSend} className="flex gap-2">
        <Input
          placeholder="Type a message"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
        />
        <Button type="submit" disabled={sending || !text.trim()}>
          Send
        </Button>
      </form>
    );
  }

  const canEnd = chat?.status === "accepted";
  const canBlock =
    chat?.status === "accepted" || chat?.status === "pending";

  return (
    <>
      <Navbar />
      <main className="mx-auto flex max-w-2xl flex-col p-6">
        <Link href="/inbox" className="text-sm underline">
          ← Back to inbox
        </Link>

        {chatState === "loading" && <p className="mt-6">Loading...</p>}
        {chatState === "notfound" && (
          <p className="mt-6">This conversation doesn't exist.</p>
        )}

        {chatState === "found" && chat && (
          <>
            <div className="mt-4 flex items-start justify-between">
              <div>
                <h1 className="text-xl font-semibold">{otherName}</h1>
                <p className="text-sm text-muted-foreground">
                  Flight {chat.flightCode}
                </p>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger
                  className="rounded-full p-2 outline-none hover:bg-muted"
                  aria-label="Chat options"
                >
                  <MoreVertical className="h-5 w-5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {canEnd && (
                    <DropdownMenuItem onClick={() => openDialog("end")}>
                      End conversation
                    </DropdownMenuItem>
                  )}
                  {canBlock && (
                    <DropdownMenuItem onClick={() => openDialog("block")}>
                      Block
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => openDialog("report")}>
                    Report
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="mt-4 flex h-[55vh] flex-col gap-2 overflow-y-auto rounded-lg border p-4">
              {messages.map((m) => {
                const mine = m.senderUid === user.uid;
                return (
                  <div
                    key={m.id}
                    className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                      mine
                        ? "self-end bg-[#006564] text-white"
                        : "self-start bg-muted"
                    }`}
                  >
                    {m.text}
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <div className="mt-3">{renderBottom()}</div>
          </>
        )}
      </main>

      {/* End conversation */}
      <Dialog
        open={dialog === "end"}
        onOpenChange={(isOpen) => {
          if (!isOpen) closeDialog();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>End this conversation?</DialogTitle>
            <DialogDescription>
              Neither of you will be able to send new messages. You can still
              read the old ones from your inbox.
            </DialogDescription>
          </DialogHeader>
          {dialogError && <p className="text-sm text-red-600">{dialogError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button onClick={handleEnd} disabled={working}>
              {working ? "Ending..." : "End conversation"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Block */}
      <Dialog
        open={dialog === "block"}
        onOpenChange={(isOpen) => {
          if (!isOpen) closeDialog();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Block {otherName}?</DialogTitle>
            <DialogDescription>
              This ends the conversation, and they won't be able to message you
              again on this flight. They won't be told that you blocked them.
            </DialogDescription>
          </DialogHeader>
          {dialogError && <p className="text-sm text-red-600">{dialogError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleBlock}
              disabled={working}
            >
              {working ? "Blocking..." : "Block"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Report */}
      <Dialog
        open={dialog === "report"}
        onOpenChange={(isOpen) => {
          if (!isOpen) closeDialog();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report {otherName}</DialogTitle>
            <DialogDescription>
              Tell us what happened. Reports are saved for review, and the
              person won't be told that you reported them.
            </DialogDescription>
          </DialogHeader>

          {reportSent ? (
            <div className="grid gap-3">
              <p className="text-sm">
                Thank you, your report has been submitted. You can also end the
                conversation or block this person from the menu.
              </p>
              <div className="flex justify-end">
                <Button onClick={closeDialog}>Close</Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleReport} className="grid gap-3">
              <Select
                value={reportReason}
                onValueChange={(v) => setReportReason(v ?? "")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a reason" />
                </SelectTrigger>
                <SelectContent>
                  {REPORT_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Textarea
                placeholder="Add details (optional)"
                value={reportDetails}
                onChange={(e) => setReportDetails(e.target.value)}
                maxLength={500}
                rows={3}
              />
              {dialogError && (
                <p className="text-sm text-red-600">{dialogError}</p>
              )}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={closeDialog}>
                  Cancel
                </Button>
                <Button type="submit" disabled={working}>
                  {working ? "Submitting..." : "Submit report"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}