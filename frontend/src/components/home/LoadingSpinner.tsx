interface LoadingSpinnerProps {
  label?: string;
}

export function LoadingSpinner({ label = "Loading..." }: LoadingSpinnerProps) {
  return (
    <div className="flex h-screen w-screen items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-muted border-t-primary" />
        <p className="text-primary text-sm font-medium">{label}</p>
      </div>
    </div>
  );
}
