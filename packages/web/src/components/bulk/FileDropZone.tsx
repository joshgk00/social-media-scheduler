import { useRef, useState, type KeyboardEvent } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

const MAX_CSV_BYTES = 10 * 1024 * 1024;

export function FileDropZone({
  file,
  onFileChange,
}: {
  file: File | null;
  onFileChange: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function chooseFile(nextFile: File | null) {
    if (nextFile && !nextFile.name.toLowerCase().endsWith('.csv') && nextFile.type !== 'text/csv') {
      setError("That isn't a CSV. Use a .csv file with UTF-8 encoding.");
      return;
    }
    if (nextFile && nextFile.size > MAX_CSV_BYTES) {
      setError('File exceeds the 10 MB limit. Split into smaller batches.');
      return;
    }
    setError(null);
    onFileChange(nextFile);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      inputRef.current?.click();
    }
  }

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload CSV file. Press Enter to choose a file."
        aria-live="polite"
        onClick={() => inputRef.current?.click()}
        onKeyDown={handleKeyDown}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          chooseFile(event.dataTransfer.files[0] ?? null);
        }}
        className={cn(
          'flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed bg-muted/20 p-6 text-center transition-colors',
          isDragging ? 'border-primary' : 'border-border',
        )}
      >
        <Upload className="mb-3 h-8 w-8 text-muted-foreground" aria-hidden="true" />
        {file ? (
          <>
            <p className="text-sm font-semibold">{file.name}</p>
            <p className="text-xs text-muted-foreground">{Math.ceil(file.size / 1024)} KB</p>
            <Button type="button" variant="link" className="mt-2" onClick={() => inputRef.current?.click()}>
              Choose a different file
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {isDragging ? 'Release to attach' : 'Drop a CSV here or click to browse'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">UTF-8 encoded, max 10 MB.</p>
          </>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
      />
    </div>
  );
}
