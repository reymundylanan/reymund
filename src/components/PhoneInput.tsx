"use client";

import { useState } from "react";
import { formatPhMobile, phMobileDigits, phMobileError } from "@/lib/phMobile";

/**
 * The mobile-number field used on every form: digits only, 11 at most,
 * shown as "0917 123 4567". The value given back is the plain digits
 * ("09171234567"). The hint turns red once the field has been left invalid.
 */
export default function PhoneInput({
  value,
  onChange,
  optional = false,
  disabled = false,
  className = "",
  id,
  placeholder = "0917 123 4567",
}: {
  value: string;
  onChange: (digits: string) => void;
  optional?: boolean;
  disabled?: boolean;
  className?: string;
  id?: string;
  placeholder?: string;
}) {
  const [touched, setTouched] = useState(false);
  const error = phMobileError(value, { optional });
  const show = touched && !!error && !disabled;
  return (
    <>
      <input
        id={id}
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        value={formatPhMobile(value)}
        onChange={(e) => onChange(phMobileDigits(e.target.value))}
        onBlur={() => setTouched(true)}
        disabled={disabled}
        placeholder={placeholder}
        maxLength={13}
        aria-invalid={show}
        className={`${className} ${show ? "!border-red-400" : ""}`}
      />
      {show && <span className="mt-1 block text-xs font-normal text-red-600">{error}</span>}
    </>
  );
}
