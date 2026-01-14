"use client";

import { useState, useEffect } from "react";
import { getHealth, type RedisStatus } from "@/lib/apiClient";
import styles from "./RedisStatusIndicator.module.css";

interface RedisStatusIndicatorProps {
  className?: string;
  subtle?: boolean;
}

export default function RedisStatusIndicator({ className, subtle = false }: RedisStatusIndicatorProps) {
  const [redisStatus, setRedisStatus] = useState<RedisStatus | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  const checkRedisStatus = async () => {
    try {
      const health = await getHealth();
      setRedisStatus(health.redis || null);
      setIsChecking(false);
    } catch (error) {
      console.error("Failed to check Redis status:", error);
      setRedisStatus({
        connected: false,
        type: "unknown",
        error: "Failed to check status",
      });
      setIsChecking(false);
    }
  };

  useEffect(() => {
    // Check immediately
    checkRedisStatus();

    // Then check every 10 seconds
    const interval = setInterval(checkRedisStatus, 10000);

    return () => clearInterval(interval);
  }, []);

  if (!redisStatus) {
    return null;
  }

  const isConnected = redisStatus.connected;
  const isRedis = redisStatus.type === "redis";
  const statusText = isConnected
    ? isRedis
      ? "Redis Connected"
      : "In-Memory Mode"
    : "Redis Disconnected";

  return (
    <div
      className={`${styles.redisIndicator} ${className || ""} ${
        isConnected ? styles.connected : styles.disconnected
      } ${subtle ? styles.subtle : ""}`}
      title={
        redisStatus.error
          ? `Redis Error: ${redisStatus.error}`
          : isConnected
          ? isRedis
            ? "Redis session storage is connected"
            : "Using in-memory session storage (development mode)"
          : "Redis session storage is disconnected"
      }
    >
      <span
        className={`${styles.statusDot} ${
          isConnected ? styles.dotConnected : styles.dotDisconnected
        }`}
      />
      <span className={styles.statusText}>{statusText}</span>
    </div>
  );
}
