import { Clock, MapPin, Phone } from "lucide-react";

export default function JoinTeamCta() {
  return (
    <section className="mx-auto max-w-7xl px-6 pb-20">
      <div className="grid gap-8 rounded-3xl bg-gradient-to-br from-[#2c2018] via-[#3a2a22] to-[#c9836f] p-10 text-white lg:grid-cols-[1.3fr_1fr]">
        <div>
          <h2 className="text-3xl font-semibold sm:text-4xl">
            Join Our Growing
            <br />
            <span className="text-coral">Professional Team</span>
          </h2>
          <p className="mt-4 max-w-md text-white/80">
            Under the leadership of Ms. Liberose T. Amir, we are constantly
            expanding. If you are a certified aesthetician or wellness
            professional, we&apos;d love to hear from you.
          </p>
        </div>

        <div className="rounded-2xl bg-white/10 p-6 backdrop-blur">
          <p className="font-semibold">Contact Our Office</p>

          <div className="mt-5 space-y-4 text-sm">
            <div>
              <p className="flex items-center gap-2 text-xs font-medium uppercase text-white/50">
                <Phone className="h-3.5 w-3.5" /> Phone
              </p>
              <p className="mt-1">+63 0970 081 0473</p>
            </div>
            <div>
              <p className="flex items-center gap-2 text-xs font-medium uppercase text-white/50">
                <Clock className="h-3.5 w-3.5" /> Office Hours
              </p>
              <p className="mt-1">Mon-Sun: 9AM-9PM</p>
            </div>
            <div>
              <p className="flex items-center gap-2 text-xs font-medium uppercase text-white/50">
                <MapPin className="h-3.5 w-3.5" /> Main Hub
              </p>
              <p className="mt-1">One Cecilia Building, Pagadian City</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
