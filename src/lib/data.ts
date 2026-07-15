export type Service = {
  id: string;
  category: string;
  name: string;
  rating: number;
  description: string;
  duration: string;
  next: string;
  singlePrice: number;
  packPrice: number;
  image: string;
};

export const services: Service[] = [
  {
    id: "gluta-crystal-drip",
    category: "Body",
    name: "Gluta Crystal Drip",
    rating: 4.9,
    description:
      "A premium whitening treatment designed to brighten and even out skin tone.",
    duration: "75 mins",
    next: "Today",
    singlePrice: 1999,
    packPrice: 7500,
    image: "/images/services/spaservice.jpg",
  },
  {
    id: "immune-booster-cocktail",
    category: "Body",
    name: "Immune Booster Cocktail",
    rating: 4.9,
    description:
      "A powerful blend of vitamins and antioxidants that strengthens the immune system.",
    duration: "60 mins",
    next: "Today",
    singlePrice: 899,
    packPrice: 3999,
    image: "/images/about/about1.jpg",
  },
  {
    id: "cinderella-super-whitening-drip",
    category: "Body",
    name: "Cinderella Super Whitening Drip",
    rating: 4.9,
    description:
      "An advanced glutathione infusion that promotes lighter, more radiant skin.",
    duration: "60 mins",
    next: "Today",
    singlePrice: 2500,
    packPrice: 9999,
    image: "/images/hero/salon1.jpg",
  },
  {
    id: "snow-white-slimming-drip",
    category: "Body",
    name: "Snow White + Slimming Drip",
    rating: 4.9,
    description:
      "A dual-benefit treatment that supports skin whitening while helping the body slim down.",
    duration: "60 mins",
    next: "Today",
    singlePrice: 2500,
    packPrice: 9999,
    image: "/images/branches/branches1.jpg",
  },
];

export type CatalogService = {
  id: string;
  badge: string;
  group: string;
  name: string;
  rating: number;
  description: string;
  duration: string;
  next: string;
  singlePrice: number;
  packPrice: number;
  image: string;
};

export const catalogCategories = [
  "All",
  "MesoLipo",
  "Hair Removal & Treatment",
  "Body",
  "Hand & Foot Package",
];

export const catalogServices: CatalogService[] = [
  {
    id: "double-chin",
    badge: "Body",
    group: "MesoLipo",
    name: "Double Chin",
    rating: 4.9,
    description:
      "Painless LED phototherapy treatment designed to address various skin concerns.",
    duration: "75 mins",
    next: "Today",
    singlePrice: 500,
    packPrice: 16500,
    image: "/images/services/spaservice.jpg",
  },
  {
    id: "bra-line-back",
    badge: "Body",
    group: "Hair Removal & Treatment",
    name: "Bra-line (Back)",
    rating: 4.9,
    description:
      "Remove multiple small or dot-sized warts in a single session for smoother skin.",
    duration: "60 mins",
    next: "Today",
    singlePrice: 800,
    packPrice: 3999,
    image: "/images/hero/salon1.jpg",
  },
  {
    id: "love-handle",
    badge: "Facial",
    group: "MesoLipo",
    name: "Love Handle",
    rating: 4.9,
    description:
      "Utilize high-concentration collagen, hyaluronic acid, and active ingredients to contour the body.",
    duration: "60 mins",
    next: "Today",
    singlePrice: 6000,
    packPrice: 9999,
    image: "/images/services/spaservice.jpg",
  },
  {
    id: "hips",
    badge: "Hair",
    group: "MesoLipo",
    name: "Hips",
    rating: 4.9,
    description:
      "Targeted, professional-grade solutions for various hair needs and body contouring.",
    duration: "75 mins",
    next: "Today",
    singlePrice: 1999,
    packPrice: 7500,
    image: "/images/about/about1.jpg",
  },
  {
    id: "tummy",
    badge: "Body",
    group: "Body",
    name: "Tummy",
    rating: 4.9,
    description:
      "A powerful blend of vitamins and antioxidants that strengthens and tones the midsection.",
    duration: "60 mins",
    next: "Today",
    singlePrice: 899,
    packPrice: 3999,
    image: "/images/about/about1.jpg",
  },
  {
    id: "arms",
    badge: "Hand",
    group: "MesoLipo",
    name: "Arms",
    rating: 4.9,
    description:
      "A beauty treatment designed to exfoliate, hydrate, and rejuvenate skin through cleansing, scrubbing, and massaging.",
    duration: "60 mins",
    next: "Today",
    singlePrice: 2500,
    packPrice: 9999,
    image: "/images/hero/salon1.jpg",
  },
];

export type Promotion = {
  id: string;
  title: string;
  badge: string;
};

export const promotions: Promotion[] = [
  { id: "month-awakening", title: "Month Awakening", badge: "25% OFF" },
  { id: "birthday-bliss", title: "Birthday Bliss", badge: "BOGO FREE" },
  { id: "gcash-weekend", title: "GCash Weekend", badge: "₱500 OFF" },
];

export type TeamMember = {
  id: string;
  name: string;
  position: string;
};

export const team: TeamMember[] = [
  { id: "t1", name: "Name", position: "Position" },
  { id: "t2", name: "Name", position: "Position" },
  { id: "t3", name: "Name", position: "Position" },
  { id: "t4", name: "Name", position: "Position" },
  { id: "t5", name: "Name", position: "Position" },
  { id: "t6", name: "Name", position: "Position" },
  { id: "t7", name: "Name", position: "Position" },
];

export type Review = {
  id: string;
  name: string;
  date: string;
  rating: number;
  text: string;
};

export const reviews: Review[] = [
  {
    id: "r1",
    name: "Federica M. Samelvi",
    date: "Sun, March 07, 2026 at 8:00 PM",
    rating: 5,
    text: "GlowSync made booking my spa appointment so easy! The service was smooth, and the whole experience felt premium and stress-free.",
  },
  {
    id: "r2",
    name: "Federica M. Samelvi",
    date: "Sun, March 07, 2026 at 8:00 PM",
    rating: 5,
    text: "GlowSync made booking my spa appointment so easy! The service was smooth, and the whole experience felt premium and stress-free.",
  },
];

export type Branch = {
  id: string;
  name: string;
  hours: string;
  address: string;
  open: boolean;
};

export const branches: Branch[] = [
  {
    id: "one-cecilia-center",
    name: "One Cecilia Center",
    hours: "10:00 am - 4:00 pm",
    address:
      "3rd Floor, One Cecilia Center, corner Alano Street, R. Magsaysay St, Pagadian City, Zamboanga del Sur",
    open: true,
  },
  {
    id: "robinson-mall",
    name: "Robinsons Pagadian",
    hours: "10:00 am - 4:00 pm",
    address:
      "F.S. Pajares Ave cor P.L. Urro St, cor Vicencio Sagun St, San Francisco District, Pagadian City, Zamboanga del Sur",
    open: true,
  },
];

export type BranchContact = {
  id: string;
  name: string;
  rating: number;
  area: string;
  address: string;
  phone: string;
  email: string;
  facebook: string;
  open: boolean;
  hours: { day: string; time: string }[];
};

const weekHours = [
  { day: "Sunday", time: "08:00 AM - 06:00 PM" },
  { day: "Monday", time: "08:00 AM - 06:00 PM" },
  { day: "Tuesday", time: "08:00 AM - 06:00 PM" },
  { day: "Wednesday", time: "08:00 AM - 06:00 PM" },
  { day: "Thursday", time: "08:00 AM - 06:00 PM" },
  { day: "Friday", time: "08:00 AM - 06:00 PM" },
  { day: "Saturday", time: "08:00 AM - 06:00 PM" },
];

export const branchContacts: BranchContact[] = [
  {
    id: "one-cecilia-center",
    name: "One Cecilia Center",
    rating: 4.9,
    area: "Pagadian",
    address:
      "3rd Floor, One Cecilia Center, corner Alano Street, R. Magsaysay St, Pagadian City, Zamboanga del Sur",
    phone: "+63 0970 081 0473",
    email: "blushspaxaesthetics@gmail.com",
    facebook: "#",
    open: true,
    hours: weekHours,
  },
  {
    id: "robinson-mall",
    name: "Robinsons Pagadian",
    rating: 4.9,
    area: "Pagadian",
    address:
      "F.S. Pajares Ave cor P.L. Urro St, cor Vicencio Sagun St, San Francisco District, Pagadian City, Zamboanga del Sur",
    phone: "+63 970 081 0473",
    email: "blushspaxaesthetics@gmail.com",
    facebook: "#",
    open: true,
    hours: weekHours,
  },
];

export type BranchService = {
  name: string;
  department?: string;
  duration: string;
  price: number;
};

export type BranchServiceCategory = {
  id: string;
  label: string;
  services: BranchService[];
};

export type AboutLocation = {
  id: string;
  name: string;
  subtitle: string;
  description: string;
};

export const aboutLocations: AboutLocation[] = [
  {
    id: "one-cecilia-center",
    name: "One Cecilia Center Branch",
    subtitle: "One Cecilia Center, Pagadian City",
    description:
      "Our flagship aesthetic center featuring advanced facial treatments, luxury massage suites, and a dedicated team of certified aesthetic professionals.",
  },
  {
    id: "robinson-pagadian",
    name: "Robinson Pagadian Branch",
    subtitle: "Robinson Galleria, Pagadian City",
    description:
      "Experience premium relaxation during your city stroll. Our Robinsons branch offers express aesthetic services and therapeutic spa packages in a modern mall setting.",
  },
];

export type CoreValue = {
  id: string;
  title: string;
  description: string;
};

export const coreValues: CoreValue[] = [
  {
    id: "professional-excellence",
    title: "Professional Excellence",
    description:
      "Every technician is highly trained and certified to ensure the safest and most effective results for your skin and body.",
  },
  {
    id: "client-engagement",
    title: "Client Engagement",
    description:
      "We don't just provide services; we build relationships. We listen to your goals and tailor every treatment to your unique needs.",
  },
  {
    id: "efficient-management",
    title: "Efficient Management",
    description:
      "Guided by Ms. Amir's leadership, our operations are optimized for minimal wait times and maximized client comfort.",
  },
  {
    id: "quality-customer-care",
    title: "Quality Customer Care",
    description:
      "From the moment you walk in to your post-treatment follow-up, your well-being is our primary focus.",
  },
  {
    id: "modern-aesthetics",
    title: "Modern Aesthetics",
    description:
      "We stay at the forefront of the industry, utilizing the latest technology and premium products from around the world.",
  },
  {
    id: "community-presence",
    title: "Community Presence",
    description:
      "Proudly serving Pagadian City, we aim to uplift our local community through wellness and professional growth.",
  },
];

export const trustBadges = [
  "Certified Aesthetic Technicians",
  "FDA Approved Products",
  "Voted Best Spa 2023",
  "BFP & LGU Compliant",
];

export type Testimonial = {
  id: string;
  text: string;
  author: string;
  rating: number;
};

export const testimonials: Testimonial[] = [
  {
    id: "t1",
    text: "The team at One Cecilia is exceptional. The facial treatments here have truly transformed my skin's texture. Professionalism at its finest.",
    author: "Anonymous",
    rating: 5,
  },
  {
    id: "t2",
    text: "I always visit the Robinsons branch after shopping. Their signature massage is the perfect way to recharge. Highly recommended!",
    author: "Anonymous",
    rating: 5,
  },
  {
    id: "t3",
    text: "Efficient management indeed. I never have to wait long, and the service is always top-tier. Ms. Amir has done wonders for the team.",
    author: "Anonymous",
    rating: 5,
  },
];

export type Professional = {
  id: string;
  name: string;
  role: string;
};

export const professionals: Professional[] = [
  { id: "richard", name: "Richard", role: "Nail Technician" },
  { id: "jade", name: "Jade", role: "Massage Therapist" },
  { id: "ivanjhoy", name: "IvanJhoy", role: "Hair Artistry" },
  { id: "arnel", name: "Arnel", role: "Nail Technician" },
  { id: "balong", name: "Balong", role: "Massage Therapist" },
];

export const timeSlots = [
  "9:00 AM",
  "9:20 AM",
  "9:35 AM",
  "9:50 AM",
  "10:00 AM",
  "10:20 AM",
  "10:35 AM",
  "10:50 AM",
  "11:00 AM",
  "11:20 AM",
  "11:35 AM",
  "1:00 PM",
  "1:20 PM",
  "1:35 PM",
  "2:00 PM",
  "2:20 PM",
  "2:35 PM",
  "3:00 PM",
  "3:20 PM",
  "3:35 PM",
  "4:00 PM",
  "4:20 PM",
  "4:35 PM",
  "5:00 PM",
];

export const branchServiceCategories: BranchServiceCategory[] = [
  {
    id: "body-spa-massage",
    label: "Body Spa & Massage",
    services: [
      { name: "Foot Massage", duration: "1 hour", price: 250 },
      { name: "Foot Massage", duration: "30 mins.", price: 150 },
      { name: "Hot Stone Massage", duration: "1 hour", price: 350 },
      { name: "Hot Stone Massage", duration: "30 mins.", price: 200 },
      { name: "Aromatherapy Body Massage", duration: "1 hour", price: 350 },
      { name: "Aromatherapy Body Massage", duration: "30 mins.", price: 200 },
      { name: "Body Bleaching", duration: "1 hour", price: 450 },
      { name: "Body Scrub", duration: "1 hour", price: 450 },
    ],
  },
  {
    id: "body-waxing",
    label: "Body Waxing",
    services: [
      { name: "Underarm", duration: "1 hour", price: 250 },
      { name: "Half Leg", duration: "1 hour", price: 350 },
      { name: "Full Leg", duration: "30 mins.", price: 350 },
      { name: "Brazilian", duration: "1 hour", price: 1000 },
    ],
  },
  {
    id: "rf-slimming-therapy",
    label: "RF Slimming Therapy",
    services: [
      { name: "Arm", duration: "1 hour", price: 450 },
      { name: "Face", duration: "30 mins.", price: 450 },
      { name: "Abdomen", duration: "1 hour", price: 350 },
      { name: "Leg", duration: "30 mins.", price: 200 },
    ],
  },
  {
    id: "skin-treatment",
    label: "Skin Treatment",
    services: [
      { name: "Deep Cleansing Facial", duration: "1 hour", price: 600 },
      { name: "Anti-Aging Facial", duration: "1 hour", price: 800 },
    ],
  },
  {
    id: "beauty-drip-booster",
    label: "Beauty Drip & Booster Cocktails",
    services: [
      { name: "Gluta Crystal Drip", duration: "75 mins.", price: 1999 },
      { name: "Immune Booster Cocktail", duration: "60 mins.", price: 899 },
    ],
  },
];
