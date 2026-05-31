import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Contact } from "@/components/sections/Contact";
import { Hero } from "@/components/sections/Hero";
import { Projects } from "@/components/sections/Projects";
import { Skills } from "@/components/sections/Skills";
import { WhatIBuild } from "@/components/sections/WhatIBuild";

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        aria-hidden="true"
      >
        <div className="absolute left-1/2 top-[-10%] h-[40rem] w-[40rem] -translate-x-1/2 rounded-full bg-primary/15 blur-[120px]" />
        <div className="absolute right-[-10%] top-[30%] h-[28rem] w-[28rem] rounded-full bg-chart-2/10 blur-[120px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,transparent_40%,oklch(0.16_0.012_240)_85%)]" />
      </div>

      <Header />

      <main>
        <Hero />
        <WhatIBuild />
        <Skills />
        <Projects />
        <Contact />
      </main>

      <Footer />
    </div>
  );
}