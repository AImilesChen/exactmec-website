import React, { useEffect, useRef, useState } from 'react';
import { CaretDown, SquaresFour, UserCircle } from '@phosphor-icons/react';

export function AccountMenu() {
  const [open, setOpen] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const root = useRef(null);
  const trigger = useRef(null);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setCanManage(false);
    fetch('/api/customer/session', {
      credentials: 'same-origin', cache: 'no-store', redirect: 'error',
      referrerPolicy: 'no-referrer', signal: controller.signal,
    }).then(response => response.ok ? response.json() : null)
      .then(session => { if (!controller.signal.aborted) setCanManage(session?.authenticated === true && session?.canManage === true); })
      .catch(() => { if (!controller.signal.aborted) setCanManage(false); });
    return () => controller.abort();
  }, [open]);

  useEffect(() => {
    const onOutside = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', onOutside);
    return () => document.removeEventListener('pointerdown', onOutside);
  }, []);

  return <div className="header-account" ref={root} onKeyDown={event => {
    if (event.key === 'Escape' && open) { event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
  }}>
    <button ref={trigger} type="button" className="header-account-trigger" aria-label="Personal center" aria-expanded={open} aria-controls="header-account-menu" onClick={() => setOpen(value => !value)}>
      <UserCircle size={21} aria-hidden="true"/><span>My Account</span><CaretDown size={13} aria-hidden="true"/>
    </button>
    {open && <nav id="header-account-menu" className="header-account-menu" aria-label="Personal center">
      <a href="/account/login/" onClick={() => setOpen(false)}><UserCircle size={19} aria-hidden="true"/>My inquiries</a>
      {canManage && <a href="/manage/leads/" onClick={() => setOpen(false)}><SquaresFour size={19} aria-hidden="true"/>Management</a>}
    </nav>}
  </div>;
}
