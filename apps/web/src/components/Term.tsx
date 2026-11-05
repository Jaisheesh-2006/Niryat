import { useId } from "react";
import { glossary, type TermId } from "../lib/glossary";

export function Term({ term }: { term: TermId }) {
  const descriptionId = useId();
  const entry = glossary[term];
  return (
    <span>
      <span id={descriptionId}>{entry.plain}</span> (
      <abbr title={entry.plain} aria-describedby={descriptionId}>
        {entry.term}
      </abbr>
      )
    </span>
  );
}
