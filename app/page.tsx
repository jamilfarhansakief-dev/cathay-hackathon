"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/AuthProvider";

export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuth();

  // If already logged in, go to the dashboard
  useEffect(() => {
    if (!loading && user) {
      router.push("/dashboard");
    }
  }, [user, loading, router]);

  return (
    <div className="bg-[#006564] homepage-out">
      <div className="mx-auto my-auto">
        <div className="home-heading">
          <h1>Cathay Together</h1>
        </div>
        <div className="home-description">Every journey is better together</div>
        <div className="buttons-div">
          <Button
            asChild
            className="auth-button transition-transform duration-200 hover:scale-105 active:scale-95"
          >
            <Link href="/signup">Sign up</Link>
          </Button>
          <Button
            asChild
            className="auth-button transition-transform duration-200 hover:scale-105 active:scale-95"
          >
            <Link href="/login">Log In</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}