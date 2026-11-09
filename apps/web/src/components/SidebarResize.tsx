"use client";

import { useState } from "react";

export function SidebarResize() {
  const [width, setWidth] = useState(264);

  function resize(handle: HTMLElement, value: number) {
    const next = Math.min(384, Math.max(224, value));
    handle.parentElement?.style.setProperty("--niryat-sidebar-width", `${next}px`);
    setWidth(next);
  }

  return (
    <hr
      className="sidebar-resize"
      tabIndex={0}
      aria-label="Sidebar width"
      aria-orientation="vertical"
      aria-controls="nav-menu"
      aria-valuemin={224}
      aria-valuemax={384}
      aria-valuenow={width}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        const left = event.currentTarget.parentElement?.getBoundingClientRect().left ?? 0;
        resize(event.currentTarget, event.clientX - left);
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onKeyDown={(event) => {
        let value = width;
        switch (event.key) {
          case "ArrowLeft":
            value -= 16;
            break;
          case "ArrowRight":
            value += 16;
            break;
          case "Home":
            value = 224;
            break;
          case "End":
            value = 384;
            break;
          default:
            return;
        }
        event.preventDefault();
        resize(event.currentTarget, value);
      }}
    />
  );
}
