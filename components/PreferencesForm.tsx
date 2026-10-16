"use client";

import { useState, FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type Preferences = {
  travellerType: string;
  connectReasons: string[];
  personality: string;
  interests: string[];
  stayAwake: string;
  visibility: {
    travellerType: boolean;
    connectReasons: boolean;
    personality: boolean;
    interests: boolean;
    stayAwake: boolean;
  };
};

const TRAVELLER_TYPES = ["Solo", "Family", "Business", "Student"];
const CONNECT_REASONS = [
  "Share a cab",
  "Travel / sightsee together",
  "Just meet new people",
];
const PERSONALITIES = ["Extroverted", "Introverted", "Ambivert"];
const INTERESTS = [
  "Business networking",
  "Hobbies",
  "Food & dining",
  "Sightseeing",
  "Photography",
  "Music",
  "Sports & fitness",
  "Books & movies",
  "Tech",
  "Art & culture",
];
const STAY_AWAKE = ["Yes", "No", "No preference"];

function Chip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={selected ? "default" : "outline"}
      onClick={onClick}
    >
      {label}
    </Button>
  );
}

function Question({
  label,
  hint,
  visible,
  onVisibleChange,
  children,
}: {
  label: string;
  hint?: string;
  visible: boolean;
  onVisibleChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Label className="text-sm font-medium">{label}</Label>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-muted-foreground">Show</span>
          <Switch checked={visible} onCheckedChange={onVisibleChange} />
        </div>
      </div>
      {children}
    </div>
  );
}

export default function PreferencesForm({
  onSubmit,
}: {
  onSubmit: (prefs: Preferences) => void;
}) {
  const [travellerType, setTravellerType] = useState("");
  const [connectReasons, setConnectReasons] = useState<string[]>([]);
  const [personality, setPersonality] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [stayAwake, setStayAwake] = useState("");
  const [visibility, setVisibility] = useState({
    travellerType: true,
    connectReasons: true,
    personality: true,
    interests: true,
    stayAwake: true,
  });

  function toggleInList(
    list: string[],
    setList: (l: string[]) => void,
    item: string
  ) {
    setList(
      list.includes(item) ? list.filter((i) => i !== item) : [...list, item]
    );
  }

  function setVis(key: keyof typeof visibility, value: boolean) {
    setVisibility((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit({
      travellerType,
      connectReasons,
      personality,
      interests,
      stayAwake,
      visibility,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3">
      <p className="text-xs text-muted-foreground">
        All questions are optional. Use the "Show" switch to choose which
        answers other passengers can see.
      </p>

      <Question
        label="1. How are you travelling?"
        visible={visibility.travellerType}
        onVisibleChange={(v) => setVis("travellerType", v)}
      >
        <Select value={travellerType} onValueChange={setTravellerType}>
          <SelectTrigger>
            <SelectValue placeholder="Select one" />
          </SelectTrigger>
          <SelectContent>
            {TRAVELLER_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Question>

      <Question
        label="2. Why do you want to connect?"
        hint="Select all that apply"
        visible={visibility.connectReasons}
        onVisibleChange={(v) => setVis("connectReasons", v)}
      >
        <div className="flex flex-wrap gap-2">
          {CONNECT_REASONS.map((r) => (
            <Chip
              key={r}
              label={r}
              selected={connectReasons.includes(r)}
              onClick={() => toggleInList(connectReasons, setConnectReasons, r)}
            />
          ))}
        </div>
      </Question>

      <Question
        label="3. How would you describe yourself?"
        visible={visibility.personality}
        onVisibleChange={(v) => setVis("personality", v)}
      >
        <div className="flex flex-wrap gap-2">
          {PERSONALITIES.map((p) => (
            <Chip
              key={p}
              label={p}
              selected={personality === p}
              onClick={() => setPersonality(p)}
            />
          ))}
        </div>
      </Question>

      <Question
        label="4. Interests"
        hint="Select all that apply"
        visible={visibility.interests}
        onVisibleChange={(v) => setVis("interests", v)}
      >
        <div className="flex flex-wrap gap-2">
          {INTERESTS.map((i) => (
            <Chip
              key={i}
              label={i}
              selected={interests.includes(i)}
              onClick={() => toggleInList(interests, setInterests, i)}
            />
          ))}
        </div>
      </Question>

      <Question
        label="5. Do you plan to stay awake through the flight?"
        visible={visibility.stayAwake}
        onVisibleChange={(v) => setVis("stayAwake", v)}
      >
        <Select value={stayAwake} onValueChange={setStayAwake}>
          <SelectTrigger>
            <SelectValue placeholder="Select one" />
          </SelectTrigger>
          <SelectContent>
            {STAY_AWAKE.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Question>

      <Button type="submit">Join the flight room</Button>
    </form>
  );
}