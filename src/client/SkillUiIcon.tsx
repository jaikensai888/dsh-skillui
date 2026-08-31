interface SkillUiIconProps {
  size?: number
  className?: string
}

/** A compact document/code glyph for the Skill UI sidebar tab. */
export function SkillUiIcon({ size = 16, className }: SkillUiIconProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M4 1.75h5.25L12.5 5v9.25H4A1.25 1.25 0 0 1 2.75 13V3A1.25 1.25 0 0 1 4 1.75Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M9.25 1.75V5h3.25"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="m6.25 8-1.25 1.5 1.25 1.5M9.75 8 11 9.5 9.75 11"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
