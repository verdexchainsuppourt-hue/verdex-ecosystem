"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { SectionHeading } from "@/components/shared/section-heading";
import { Reveal } from "@/components/shared/reveal";
import { FAQS } from "@/lib/mock-data";

export function FaqSection({ limit = 8 }: { limit?: number }) {
  const faqs = FAQS.slice(0, limit);
  return (
    <section className="container py-24" aria-label="Frequently asked questions">
      <SectionHeading
        tag="FAQ"
        title={<>Questions, <span className="text-gradient">answered.</span></>}
        description="Straight answers about the exchange, liquidity, mining, and account security."
      />
      <Reveal className="mx-auto mt-12 max-w-3xl">
        <Accordion type="single" collapsible className="space-y-3">
          {faqs.map((f, i) => (
            <AccordionItem key={i} value={`faq-${i}`}>
              <AccordionTrigger>{f.question}</AccordionTrigger>
              <AccordionContent>{f.answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        {FAQS.length > limit && (
          <div className="mt-6 text-center">
            <Link href="/docs" className="group inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-bright">
              Read the full documentation
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
          </div>
        )}
      </Reveal>
    </section>
  );
}
