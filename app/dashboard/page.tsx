"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import Navbar from "@/components/Navbar";
import PreferencesForm, { Preferences } from "@/components/PreferencesForm";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
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
};

type JoinedFlight = Flight & { code: string };

export default function Dashboard() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [flightCode, setFlightCode] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [myFlights, setMyFlights] = useState<JoinedFlight[]>([]);

  // If not logged in, go to the signup page
  useEffect(() => {
    if (!loading && !user) {
      router.push("/signup");
    }
  }, [user, loading, router]);

  // Listen to the rooms this user has joined
  useEffect(() => {
    if (!user) return;

    const unsubscribe = onSnapshot(
      collection(db, "users", user.uid, "flights"),
      (snapshot) => {
        const list = snapshot.docs.map((d) => d.data() as JoinedFlight);
        setMyFlights(list);
      },
      (err) => console.error(err)
    );

    return () => unsubscribe();
  }, [user]);

  function handleOpenChange(isOpen: boolean) {
    setOpen(isOpen);
    if (!isOpen) {
      setCode("");
      setFlightCode("");
      setError("");
      setFlight(null);
    }
  }

  async function handleCheckCode(e: FormEvent) {
    e.preventDefault();
    setError("");
    setChecking(true);

    try {
      const cleanCode = code.trim().toUpperCase();
      const snapshot = await getDoc(doc(db, "flights", cleanCode));

      if (snapshot.exists()) {
        setFlight(snapshot.data() as Flight);
        setFlightCode(cleanCode);
      } else {
        setError("Invalid flight code. Please check and try again.");
      }
    } catch (err) {
      setError("Something went wrong. Please try again.");
    }
    setChecking(false);
  }

  async function handlePrefsSubmit(prefs: Preferences) {
    if (!user || !flight) return;
    setError("");
    setSaving(true);

    try {
      // Save both writes together: the passenger entry in the room,
      // and a shortcut under the user so the dashboard can list their rooms
      const batch = writeBatch(db);

      batch.set(doc(db, "flights", flightCode, "passengers", user.uid), {
        uid: user.uid,
        name: user.displayName ?? "Traveller",
        ...prefs,
        joinedAt: serverTimestamp(),
      });

      batch.set(doc(db, "users", user.uid, "flights", flightCode), {
        code: flightCode,
        flightNumber: flight.flightNumber,
        origin: flight.origin,
        destination: flight.destination,
        joinedAt: serverTimestamp(),
      });

      await batch.commit();
      router.push(`/dashboard/${flightCode}`);
    } catch (err) {
      console.error(err);
      setError("Could not save your preferences. Please try again.");
      setSaving(false);
    }
  }

  if (loading || !user) {
    return null;
  }

  return (
    <>
      <Navbar />
      <Button
        onClick={() => setOpen(true)}
        className="max-w-[120px] pt-[15px] pb-[15px] mt-[15px] ml-[20px]"
      >
        + JOIN ROOM
      </Button>

      {myFlights.length > 0 && (
        <section className="p-5">
          <h2 className="mb-3 text-lg font-semibold">Your flights</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {myFlights.map((f) => (
              <Link key={f.code} href={`/dashboard/${f.code}`}>
                <Card className="transition-shadow hover:shadow-md">
                  <CardHeader>
                    <CardTitle>{f.code}</CardTitle>
                    <CardDescription>
                      {f.flightNumber}: {f.origin} → {f.destination}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {flight
                ? `${flight.flightNumber}: ${flight.origin} → ${flight.destination}`
                : "Join a flight room"}
            </DialogTitle>
            <DialogDescription>
              {flight
                ? "Tell us about yourself so we can match you with fellow passengers."
                : "Enter the flight code you received when you bought your ticket."}
            </DialogDescription>
          </DialogHeader>

          {!flight ? (
            <form onSubmit={handleCheckCode} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="flightCode">Flight code</Label>
                <Input
                  id="flightCode"
                  placeholder="e.g. CX100-DEMO"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button type="submit" disabled={checking}>
                {checking ? "Checking..." : "Continue"}
              </Button>
            </form>
          ) : (
            <div className="grid gap-3">
              <PreferencesForm onSubmit={handlePrefsSubmit} />
              {saving && <p className="text-sm">Saving...</p>}
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}