import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button"; // shadcn button
import { X } from "lucide-react";

const STORAGE_KEY = "dismiss_brave_shields_notice_v1";

export function BraveShieldsNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(STORAGE_KEY)) return; // user dismissed previously

    let mounted = true;

    (async () => {
      try {
        // Preferred: Brave exposes navigator.brave.isBrave() returning a Promise<boolean>
        const b = (navigator as any).brave;
        if (b) {
          if (typeof b.isBrave === "function") {
            const isBrave = await b.isBrave();
            if (isBrave && mounted) setVisible(true);
          }
        }
      } catch (err) {
        // ignore - don't show banner if detection fails
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  if (!visible) return null;

  const dismissPermanently = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  };

  return (
    <div className="fixed inset-x-4 bottom-6 z-[9999]">
      <div className="max-w-3xl mx-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-lg rounded-lg p-4 flex gap-4 items-start">
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Brave Shields may block drawing features
            </h3>
          </div>

          <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
            It looks like you’re using the Brave browser. Brave’s privacy
            Shields can prevent the canvas from detecting pointer hits, which
            may break drawing behavior. To fix it, click the Brave icon in the
            address bar and choose{" "}
            <span className="font-medium">“Shields down for this site”</span>.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={dismissPermanently}>Don't show again</Button>
            <Button variant="outline" onClick={() => setVisible(false)}>
              Close
            </Button>
          </div>
        </div>

        <button
          aria-label="close"
          onClick={() => setVisible(false)}
          className="ml-2 p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700"
        >
          <X className="w-4 h-4 text-slate-700 dark:text-slate-300" />
        </button>
      </div>
    </div>
  );
}
