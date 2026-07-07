// Global floating chat agent. Mounted once in App (inside the router + auth
// providers); only renders for authenticated users. The launcher toggles a
// bottom-right panel that renders data inline and can drive the app.

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MessageSquare, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ChatPanel } from "./ChatPanel";

export function ChatWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const openChat = () => setOpen(true);
    window.addEventListener("open-ai-chatbot", openChat as EventListener);
    return () => window.removeEventListener("open-ai-chatbot", openChat as EventListener);
  }, []);

  // Only for signed-in users (tools are user-scoped).
  if (!user) return null;

  return (
    <>
      <AnimatePresence>
        {open ? (
          <motion.div
            key="chat-panel"
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            style={{ transformOrigin: "bottom right" }}
            className="fixed bottom-24 right-5 z-[60] flex h-[min(660px,calc(100vh-9rem))] w-[min(420px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_24px_70px_-12px_rgba(15,23,42,0.28),0_8px_24px_-12px_rgba(15,23,42,0.16)] ring-1 ring-black/5"
          >
            <ChatPanel onClose={() => setOpen(false)} />
          </motion.div>
        ) : null}
      </AnimatePresence>

      <motion.button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close assistant" : "Open assistant"}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        className="group fixed bottom-5 right-5 z-[60] flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#2f5fd1] to-[#4f7ef0] text-white shadow-[0_12px_32px_-6px_rgba(47,95,209,0.55)]"
      >
        {/* soft pulsing halo */}
        {!open ? (
          <span className="absolute inset-0 -z-10 animate-ping rounded-2xl bg-[#2f5fd1]/30" style={{ animationDuration: "2.6s" }} />
        ) : null}
        <AnimatePresence mode="wait" initial={false}>
          {open ? (
            <motion.span key="x" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.18 }}>
              <X className="h-6 w-6" />
            </motion.span>
          ) : (
            <motion.span key="msg" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.18 }}>
              <MessageSquare className="h-6 w-6" />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </>
  );
}
