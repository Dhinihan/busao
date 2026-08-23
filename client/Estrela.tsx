export function Estrela(props: { cheia: boolean }) {
  const { cheia } = props;
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill={cheia ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    >
      <path d="M12 2.5l2.95 6.27 6.55.83-4.82 4.62 1.26 6.53L12 17.5l-5.94 3.25 1.26-6.53L2.5 9.6l6.55-.83z" />
    </svg>
  );
}
