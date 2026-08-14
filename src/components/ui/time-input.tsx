"use client";

import { forwardRef } from "react";
import { Input, type InputProps } from "@/components/ui/field";
import { normalizeTimeText } from "@/lib/utils";

export const TimeTextInput = forwardRef<HTMLInputElement, Omit<InputProps, "type">>(
  function TimeTextInput({ onChange, inputMode, maxLength, placeholder, autoComplete, ...props }, ref) {
    return (
      <Input
        ref={ref}
        type="text"
        inputMode={inputMode ?? "numeric"}
        maxLength={maxLength ?? 5}
        placeholder={placeholder ?? "HH:MM"}
        autoComplete={autoComplete ?? "off"}
        onChange={(event) => {
          event.target.value = normalizeTimeText(event.target.value);
          onChange?.(event);
        }}
        {...props}
      />
    );
  },
);
