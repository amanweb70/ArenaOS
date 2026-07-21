"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ArenaEvent, RunRecord } from "@arena/contracts";
import { arenaApi, getRunSocketUrl } from "@/lib/arena-api";
import { terminalStatuses } from "@/lib/format";
import { mergeEvents, mergeRun } from "@/lib/run-stream";
import type { StreamPacket } from "@/lib/types";

export type StreamState = "idle" | "connecting" | "live" | "recovering" | "closed";

export function useRunStream(runId: string) {
  const [run, setRun] = useState<RunRecord>();
  const [events, setEvents] = useState<ArenaEvent[]>([]);
  const [connection, setConnection] = useState<StreamState>("idle");
  const [error, setError] = useState<string>();
  const attempts = useRef(0);
  const retryTimer = useRef<number | undefined>(undefined);

  const recover = useCallback(async () => {
    try {
      const fresh = await arenaApi.run(runId);
      setRun((current) => mergeRun(current, fresh));
      setEvents((current) => mergeEvents(current, fresh.events));
      return fresh;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      return undefined;
    }
  }, [runId]);

  useEffect(() => {
    let socket: WebSocket | undefined;
    let disposed = false;

    const connect = async () => {
      const baseline = await recover();
      if (disposed || (baseline && terminalStatuses.has(baseline.status))) {
        setConnection("closed");
        return;
      }

      setConnection(attempts.current ? "recovering" : "connecting");
      socket = new WebSocket(getRunSocketUrl(runId));

      socket.addEventListener("open", () => {
        attempts.current = 0;
        setConnection("live");
        setError(undefined);
      });

      socket.addEventListener("message", (message) => {
        try {
          const packet = JSON.parse(String(message.data)) as StreamPacket;
          if (packet.type === "snapshot") {
            setRun((current) => mergeRun(current, packet.run));
            setEvents((current) => mergeEvents(current, packet.run.events));
            if (terminalStatuses.has(packet.run.status)) {
              socket?.close();
            }
            return;
          }

          setEvents((current) => mergeEvents(current, [packet.event]));
          if (
            packet.event.type === "experiment.completed" ||
            packet.event.type === "experiment.failed"
          ) {
            void recover().then((fresh) => {
              if (fresh && terminalStatuses.has(fresh.status)) socket?.close();
            });
          }
        } catch {
          setError("The live stream returned an unreadable packet.");
        }
      });

      socket.addEventListener("close", () => {
        if (disposed) return;
        void recover().then((fresh) => {
          if (fresh && terminalStatuses.has(fresh.status)) {
            setConnection("closed");
            return;
          }
          if (attempts.current >= 4) {
            setConnection("closed");
            setError("Live updates stopped. The stored run remains available.");
            return;
          }
          attempts.current += 1;
          setConnection("recovering");
          retryTimer.current = window.setTimeout(connect, 500 * 2 ** attempts.current);
        });
      });

      socket.addEventListener("error", () => socket?.close());
    };

    void connect();
    return () => {
      disposed = true;
      if (retryTimer.current) window.clearTimeout(retryTimer.current);
      socket?.close();
    };
  }, [recover, runId]);

  return { run, events, connection, error, recover };
}
