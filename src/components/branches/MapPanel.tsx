export default function MapPanel({ address }: { address: string }) {
  const query = encodeURIComponent(address);

  return (
    <div className="min-h-[500px] overflow-hidden rounded-2xl lg:min-h-full">
      <iframe
        key={query}
        title="Branch location map"
        src={`https://www.google.com/maps?q=${query}&output=embed`}
        className="h-full min-h-[500px] w-full border-0"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
    </div>
  );
}
