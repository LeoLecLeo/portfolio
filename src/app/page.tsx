import { Header } from "@/components/layout/Header";
import { Hero } from "@/components/sections/Hero";
import { WhatIBuild } from "@/components/sections/WhatIBuild";
import { Skills } from "@/components/sections/Skills";
import { Projects } from "@/components/sections/Projects";
import { Contact } from "@/components/sections/Contact";
import { Footer } from "@/components/layout/Footer";

export default function Home() {
  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <Header />
      <Hero />
      <WhatIBuild />
      <Skills />
      <Projects />
      <Contact />
      <Footer />
    </main>
  );
}