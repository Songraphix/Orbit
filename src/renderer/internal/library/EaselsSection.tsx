import { PenTool } from 'lucide-react';
import { Empty, Heading } from './LibraryPage';

/** Library → Easels (F-19): filled in by the Easels slice. */
export function EaselsSection() {
  return (
    <>
      <Heading icon={<PenTool size={22} />} title="Easels" />
      <Empty>No Easels yet.</Empty>
    </>
  );
}
