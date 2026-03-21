"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export function TrustMethodologyNote() {
  const [open, setOpen] = useState(false)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">How to read trust metrics</CardTitle>
      </CardHeader>
      <CardContent>
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              Methodology and interpretation
              <ChevronDown
                className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3 text-sm text-gray-600">
            <ul className="space-y-2">
              <li>
                TC Score is a risk prioritization signal, not certainty of fraud.
              </li>
              <li>
                Confirmed positives act as bounded training signals; they can boost
                reliable detectors but do not override precision controls.
              </li>
              <li>
                High precision with high confirmed-case hit rate is strongest evidence
                of detector trustworthiness.
              </li>
              <li>
                Department concentration rows are risk signals from cross-domain
                convergence, not final determinations of wrongdoing.
              </li>
              <li>
                Saturation metrics (&gt;=95 and =100) help monitor inflation in the top
                end of the score distribution.
              </li>
            </ul>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  )
}
