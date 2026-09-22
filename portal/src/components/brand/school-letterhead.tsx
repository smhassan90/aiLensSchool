import { assetUrl } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type SchoolLetterheadProps = {
  name: string;
  logo?: string | null;
  address?: string | null;
  phone?: string | null;
  className?: string;
  logoClassName?: string;
  titleClassName?: string;
};

export function SchoolLetterhead({
  name,
  logo,
  address,
  phone,
  className,
  logoClassName,
  titleClassName,
}: SchoolLetterheadProps) {
  const logoSrc = assetUrl(logo);

  return (
    <header className={cn("text-center", className)}>
      {logoSrc ? (
        <img
          src={logoSrc}
          alt=""
          className={cn(
            "mx-auto mb-3 h-16 w-16 rounded-lg border border-black/10 object-cover",
            logoClassName,
          )}
        />
      ) : null}
      <p className={cn("text-xl font-bold tracking-wide uppercase", titleClassName)}>{name}</p>
      {address ? <p className="mt-1 text-xs">{address}</p> : null}
      {phone ? <p className="text-xs">Contact: {phone}</p> : null}
    </header>
  );
}
