interface TelegramErrorLike {
  response?: { error_code?: number };
}

interface KnownError {
  match: (err: unknown) => boolean;
  message: string;
}

const knownErrors: KnownError[] = [
  {
    match: (err) =>
      (err as TelegramErrorLike)?.response?.error_code === 409,
    message:
      "Another bot instance is already running (409 Conflict).\n" +
      "Stop the other instance (docker compose stop bot / kill the local process) and try again.",
  },
];

export function handleStartupError(err: unknown): never {
  const known = knownErrors.find((e) => e.match(err));

  if (known) {
    console.error(`ERROR: ${known.message}`);
  } else {
    console.error("Failed to start bot:", err);
  }

  process.exit(1);
}
