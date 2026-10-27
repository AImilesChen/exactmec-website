import React from 'react';

// Small technical diagrams for the choice cards. The adjacent text remains the
// accessible label; the drawings are decorative and make the routes scannable.
export function ChoiceArt({ kind }) {
  const drawing = {
    diecast: <>
      <path className="plate" d="M7 13h21v38H7zM36 13h21v38H36z" />
      <path d="M13 19h10v26H13zM41 19h10v26H41zM23 25l5 4v6l-5 4M41 25l-5 4v6l5 4" />
      <path className="accent" d="M29 32h6M32 29v6" />
      <circle cx="11" cy="17" r="1.5" /><circle cx="53" cy="47" r="1.5" />
    </>,
    injection: <>
      <path className="plate" d="M29 11h26v42H29z" />
      <path d="M35 17h14v30H35zM42 21v22M9 27h12l8 5-8 5H9zM10 32h25" />
      <path className="accent" d="M17 32h24M40 26v12" />
      <circle cx="8" cy="32" r="2" />
    </>,
    drawings: <>
      <path className="plate" d="M13 11h33v41H13z" />
      <path d="M20 18h19M20 22h12M20 30l8-5 11 7-8 6-11-8zM20 30v9l11 7v-8M39 32v7l-8 7" />
      <path className="accent" d="M20 48h20M16 26v17" />
      <path d="M49 17h5v30h-5" />
    </>,
    sample: <>
      <path className="plate" d="m11 25 21-12 21 12-21 12-21-12z" />
      <path d="M11 25v17l21 12 21-12V25M32 37v17M22 31l10-6 10 6-10 6-10-6z" />
      <path className="accent" d="M17 43l9 5M38 48l9-5" />
    </>,
  }[kind];

  return <span className="rfq-choice-art" aria-hidden="true"><svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round"><g>{drawing}</g></svg></span>;
}
