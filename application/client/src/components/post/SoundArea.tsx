import { SoundPlayer } from "@web-speed-hackathon-2026/client/src/components/foundation/SoundPlayer";

interface Props {
  sound: Models.Sound;
}

export const SoundArea = ({ sound }: Props) => {
  return (
    <div
      className="border-cax-border relative h-24 w-full overflow-hidden rounded-lg border sm:h-28"
      data-sound-area
    >
      <SoundPlayer sound={sound} />
    </div>
  );
};
