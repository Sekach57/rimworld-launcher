interface Props {
  color: string
  letter: string
  size?: number
}

/** The coloured square with a letter that stands for an instance. */
export function Mark({ color, letter, size = 32 }: Props) {
  return (
    <span className="mark" style={{ background: color, width: size, height: size, fontSize: size * 0.44 }} aria-hidden>
      {letter || '?'}
    </span>
  )
}
