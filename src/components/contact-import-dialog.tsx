"use client"

import React from "react"

import { useState, useCallback, useTransition } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  Upload, 
  FileSpreadsheet, 
  AlertCircle, 
  CheckCircle2, 
  X,
  ArrowRight,
  Download,
  Loader2
} from "lucide-react"
import type { Keyword } from "@/lib/types"
import { importContacts } from "@/app/actions/contacts"

interface ContactImportDialogProps {
  keywords: Keyword[]
  children: React.ReactNode
}

// CSV field mapping configuration
const CONTACT_FIELDS = [
  { key: "name", label: "Name", required: true },
  { key: "email", label: "Email", required: false },
  { key: "phone", label: "Phone", required: false },
  { key: "title", label: "Title/Position", required: false },
  { key: "organization", label: "Organization", required: false },
  { key: "department", label: "Department", required: false },
  { key: "jurisdiction", label: "District/Jurisdiction", required: false },
  { key: "priority", label: "Priority (1-5)", required: false },
  { key: "notes", label: "Notes", required: false },
  { key: "keywords", label: "Keywords (comma-separated)", required: false },
] as const

type ContactFieldKey = typeof CONTACT_FIELDS[number]["key"]

interface ParsedRow {
  rowIndex: number
  data: Record<string, string>
  errors: string[]
  warnings: string[]
}

interface ImportResult {
  success: number
  failed: number
  errors: string[]
}

export function ContactImportDialog({ keywords, children }: ContactImportDialogProps) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<"upload" | "map" | "preview" | "result">("upload")
  const [isPending, startTransition] = useTransition()
  
  // File & parsing state
  const [file, setFile] = useState<File | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [rawRows, setRawRows] = useState<string[][]>([])
  const [fieldMapping, setFieldMapping] = useState<Record<ContactFieldKey, string | null>>({
    name: null,
    email: null,
    phone: null,
    title: null,
    organization: null,
    department: null,
    jurisdiction: null,
    priority: null,
    notes: null,
    keywords: null,
  })
  
  // Validation & import state
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([])
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)

  // Parse CSV file
  const parseCSV = useCallback((text: string): { headers: string[], rows: string[][] } => {
    const lines = text.split(/\r?\n/).filter(line => line.trim())
    if (lines.length === 0) {
      throw new Error("File is empty")
    }

    // Simple CSV parsing (handles quoted fields)
    const parseLine = (line: string): string[] => {
      const result: string[] = []
      let current = ""
      let inQuotes = false

      for (let i = 0; i < line.length; i++) {
        const char = line[i]
        
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"'
            i++
          } else {
            inQuotes = !inQuotes
          }
        } else if (char === "," && !inQuotes) {
          result.push(current.trim())
          current = ""
        } else {
          current += char
        }
      }
      result.push(current.trim())
      return result
    }

    const headers = parseLine(lines[0])
    const rows = lines.slice(1).map(parseLine)
    
    return { headers, rows }
  }, [])

  // Auto-detect field mappings based on header names
  const autoDetectMappings = useCallback((csvHeaders: string[]): Record<ContactFieldKey, string | null> => {
    const mapping: Record<ContactFieldKey, string | null> = {
      name: null,
      email: null,
      phone: null,
      title: null,
      organization: null,
      department: null,
      jurisdiction: null,
      priority: null,
      notes: null,
      keywords: null,
    }

    const patterns: Record<ContactFieldKey, RegExp> = {
      name: /^(name|full[\s_-]?name|contact[\s_-]?name)$/i,
      email: /^(email|e[\s_-]?mail|email[\s_-]?address)$/i,
      phone: /^(phone|telephone|mobile|cell|phone[\s_-]?number)$/i,
      title: /^(title|position|role|job[\s_-]?title)$/i,
      organization: /^(organization|org|company|agency|office)$/i,
      department: /^(department|dept|division|unit)$/i,
      jurisdiction: /^(jurisdiction|region|area|district|territory)$/i,
      priority: /^(priority|importance|rank)$/i,
      notes: /^(notes|comments|description|memo)$/i,
      keywords: /^(keywords|tags|topics|categories)$/i,
    }

    csvHeaders.forEach(header => {
      for (const [field, pattern] of Object.entries(patterns)) {
        if (pattern.test(header) && mapping[field as ContactFieldKey] === null) {
          mapping[field as ContactFieldKey] = header
          break
        }
      }
    })

    return mapping
  }, [])

  // Update field mapping
  const updateMapping = useCallback((field: ContactFieldKey, csvHeader: string | null) => {
    setFieldMapping(prev => ({ ...prev, [field]: csvHeader }))
  }, [])

  // Validate and preview data
  const validateData = useCallback(() => {
    const keywordMap = new Map(keywords.map(k => [k.name.toLowerCase(), k.id]))
    
    const validated: ParsedRow[] = rawRows.map((row, index) => {
      const data: Record<string, string> = {}
      const errors: string[] = []
      const warnings: string[] = []

      // Map CSV columns to contact fields
      for (const field of CONTACT_FIELDS) {
        const csvHeader = fieldMapping[field.key]
        if (csvHeader) {
          const colIndex = headers.indexOf(csvHeader)
          if (colIndex !== -1) {
            data[field.key] = row[colIndex] || ""
          }
        }
      }

      // Validate required fields
      if (!data.name || data.name.trim() === "") {
        errors.push("Name is required")
      }

      // Validate email format if provided
      if (data.email && data.email.trim()) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(data.email)) {
          warnings.push("Invalid email format")
        }
      }

      // Validate priority if provided
      if (data.priority && data.priority.trim()) {
        const priority = parseInt(data.priority)
        if (isNaN(priority) || priority < 1 || priority > 5) {
          warnings.push("Priority should be 1-5, defaulting to 3")
          data.priority = "3"
        }
      }

      // Validate keywords if provided
      if (data.keywords && data.keywords.trim()) {
        const keywordNames = data.keywords.split(",").map(k => k.trim().toLowerCase())
        const unknownKeywords = keywordNames.filter(k => !keywordMap.has(k))
        if (unknownKeywords.length > 0) {
          warnings.push(`Unknown keywords will be skipped: ${unknownKeywords.join(", ")}`)
        }
      }

      return { rowIndex: index + 2, data, errors, warnings } // +2 for 1-indexed + header row
    })

    setParsedRows(validated)
    setStep("preview")
  }, [rawRows, headers, fieldMapping, keywords])

  // Import contacts
  const handleImport = useCallback(() => {
    const validRows = parsedRows.filter(row => row.errors.length === 0)
    
    if (validRows.length === 0) {
      return
    }

    const keywordMap = new Map(keywords.map(k => [k.name.toLowerCase(), k.id]))

    startTransition(async () => {
      try {
        const contactsToImport = validRows.map(row => {
          // Parse keywords to IDs
          let keywordIds: string[] = []
          if (row.data.keywords) {
            keywordIds = row.data.keywords
              .split(",")
              .map(k => k.trim().toLowerCase())
              .filter(k => keywordMap.has(k))
              .map(k => keywordMap.get(k)!)
          }

          return {
            name: row.data.name,
            email: row.data.email || null,
            phone: row.data.phone || null,
            title: row.data.title || null,
            organization: row.data.organization || null,
            department: row.data.department || null,
            jurisdiction: row.data.jurisdiction || null,
            city_id: null,
            city_name: null,
            priority: row.data.priority ? parseInt(row.data.priority) : 3,
            notes: row.data.notes || null,
            keywordIds,
          }
        })

        const result = await importContacts(contactsToImport)
        setImportResult(result)
        setStep("result")
      } catch (err) {
        setImportResult({
          success: 0,
          failed: validRows.length,
          errors: [err instanceof Error ? err.message : "Import failed"]
        })
        setStep("result")
      }
    })
  }, [parsedRows, keywords, startTransition])

  // Drag-and-drop state
  const [isDragging, setIsDragging] = useState(false)

  const processFile = useCallback(async (selectedFile: File) => {
    setFile(selectedFile)
    setParseError(null)

    try {
      const text = await selectedFile.text()
      const { headers: csvHeaders, rows } = parseCSV(text)

      if (csvHeaders.length === 0) {
        throw new Error("No headers found in CSV")
      }

      if (rows.length === 0) {
        throw new Error("No data rows found in CSV")
      }

      setHeaders(csvHeaders)
      setRawRows(rows)
      setFieldMapping(autoDetectMappings(csvHeaders))
      setStep("map")
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Failed to parse CSV file")
    }
  }, [parseCSV, autoDetectMappings])

  // Handle file upload via input
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return
    await processFile(selectedFile)
  }, [processFile])

  // Handle drag-and-drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const droppedFile = e.dataTransfer.files[0]
    if (!droppedFile) return

    if (!droppedFile.name.endsWith(".csv") && droppedFile.type !== "text/csv") {
      setParseError("Please upload a CSV file")
      return
    }

    await processFile(droppedFile)
  }, [processFile])

  // Reset dialog
  const handleReset = useCallback(() => {
    setStep("upload")
    setFile(null)
    setHeaders([])
    setRawRows([])
    setFieldMapping({
      name: null,
      email: null,
      phone: null,
      title: null,
      organization: null,
      department: null,
      jurisdiction: null,
      priority: null,
      notes: null,
      keywords: null,
    })
    setParsedRows([])
    setImportResult(null)
    setParseError(null)
  }, [])

  // Download sample CSV
  const downloadSampleCSV = useCallback(() => {
    const sampleData = [
      ["Name", "Email", "Phone", "Title", "Organization", "Department", "Jurisdiction", "Priority", "Notes", "Keywords"],
      ["John Smith", "john.smith@gov.example.com", "(555) 123-4567", "City Manager", "City of Springfield", "Administration", "Springfield", "1", "Key decision maker", "budget,infrastructure"],
      ["Jane Doe", "jane.doe@county.example.gov", "(555) 234-5678", "County Commissioner", "Springfield County", "Board of Commissioners", "Springfield County", "2", "Responsive to data", "housing,transportation"],
      ["Bob Johnson", "bjohnson@state.example.gov", "(555) 345-6789", "State Representative", "State Legislature", "District 5", "State - District 5", "3", "", "education,budget"],
    ]
    
    const csv = sampleData.map(row => 
      row.map(cell => 
        cell.includes(",") || cell.includes('"') 
          ? `"${cell.replace(/"/g, '""')}"` 
          : cell
      ).join(",")
    ).join("\n")
    
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "contacts_import_template.csv"
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  const validCount = parsedRows.filter(r => r.errors.length === 0).length
  const errorCount = parsedRows.filter(r => r.errors.length > 0).length
  const warningCount = parsedRows.filter(r => r.warnings.length > 0).length

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen)
      if (!isOpen) handleReset()
    }}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            Import Contacts
          </DialogTitle>
          <DialogDescription>
            Upload a CSV file to bulk import government official contacts
          </DialogDescription>
        </DialogHeader>

        <Tabs value={step} className="flex-1 flex flex-col overflow-hidden">
          <TabsList 
            className="grid w-full grid-cols-4 p-1 h-auto gap-1"
            style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '8px' }}
          >
            <TabsTrigger 
              value="upload" 
              disabled={step !== "upload"}
              className="data-[state=active]:bg-white data-[state=active]:shadow-sm py-2.5 px-4 rounded-md text-sm font-medium"
            >
              1. Upload
            </TabsTrigger>
            <TabsTrigger 
              value="map" 
              disabled={!file}
              className="data-[state=active]:bg-white data-[state=active]:shadow-sm py-2.5 px-4 rounded-md text-sm font-medium"
            >
              2. Map Fields
            </TabsTrigger>
            <TabsTrigger 
              value="preview" 
              disabled={parsedRows.length === 0}
              className="data-[state=active]:bg-white data-[state=active]:shadow-sm py-2.5 px-4 rounded-md text-sm font-medium"
            >
              3. Preview
            </TabsTrigger>
            <TabsTrigger 
              value="result" 
              disabled={!importResult}
              className="data-[state=active]:bg-white data-[state=active]:shadow-sm py-2.5 px-4 rounded-md text-sm font-medium"
            >
              4. Result
            </TabsTrigger>
          </TabsList>

          {/* Step 1: Upload */}
          <TabsContent value="upload" className="flex-1 overflow-auto">
            <div className="space-y-6 py-6">
              {/* Upload Area */}
              <label
                htmlFor="csv-upload"
                className="flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-12 cursor-pointer transition-all"
                style={{
                  borderColor: isDragging ? 'var(--brand-primary)' : 'var(--border-primary)',
                  backgroundColor: isDragging ? 'rgba(138, 79, 255, 0.08)' : 'var(--bg-secondary)',
                }}
                onMouseEnter={(e) => {
                  if (!isDragging) {
                    e.currentTarget.style.borderColor = 'var(--brand-primary)'
                    e.currentTarget.style.backgroundColor = 'rgba(138, 79, 255, 0.05)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isDragging) {
                    e.currentTarget.style.borderColor = 'var(--border-primary)'
                    e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'
                  }
                }}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <Upload className="w-12 h-12 mb-4" style={{ color: isDragging ? 'var(--brand-primary)' : 'var(--text-tertiary)' }} />
                <span className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                  {isDragging ? "Drop CSV file here" : "Click to upload CSV file"}
                </span>
                <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                  or drag and drop
                </span>
                <input
                  id="csv-upload"
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </label>

              {parseError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{parseError}</AlertDescription>
                </Alert>
              )}

              {/* Template Download Card */}
              <div 
                className="flex items-center justify-between p-5 rounded-xl"
                style={{ backgroundColor: 'var(--bg-secondary)' }}
              >
                <div>
                  <p className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>
                    Need a template?
                  </p>
                  <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    Download our sample CSV with the correct format
                  </p>
                </div>
                <Button 
                  variant="outline" 
                  onClick={downloadSampleCSV}
                  style={{ padding: '10px 16px' }}
                  className="h-auto gap-2"
                >
                  <Download className="w-4 h-4" />
                  Download Template
                </Button>
              </div>

              {/* Supported Fields */}
              <div className="space-y-3">
                <h4 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Supported fields:
                </h4>
                <div className="flex flex-wrap gap-2">
                  {CONTACT_FIELDS.map(field => (
                    <Badge 
                      key={field.key} 
                      variant={field.required ? "default" : "outline"}
                      className="py-1 px-3 text-sm font-normal"
                    >
                      {field.label}
                      {field.required && <span className="ml-1 text-red-400">*</span>}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Step 2: Map Fields */}
          <TabsContent value="map" className="flex-1 overflow-auto">
            <div className="space-y-4 py-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Map your CSV columns to contact fields. Fields marked with * are required.
                </AlertDescription>
              </Alert>

              <div className="grid gap-4">
                {CONTACT_FIELDS.map(field => (
                  <div key={field.key} className="flex items-center gap-4">
                    <Label className="w-48 text-right">
                      {field.label}
                      {field.required && <span className="text-destructive ml-1">*</span>}
                    </Label>
                    <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <Select
                      value={fieldMapping[field.key] || "__none__"}
                      onValueChange={(value) => updateMapping(field.key, value === "__none__" ? null : value)}
                    >
                      <SelectTrigger className="w-64">
                        <SelectValue placeholder="Select CSV column" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">-- Not mapped --</SelectItem>
                        {headers.filter(h => h && h.trim() !== "").map(header => (
                          <SelectItem key={header} value={header}>
                            {header}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {fieldMapping[field.key] && (
                      <Badge variant="outline" className="text-xs">
                        Mapped
                      </Badge>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex justify-between pt-4 border-t" style={{ borderColor: 'var(--border-primary)' }}>
                <Button 
                  variant="outline" 
                  onClick={() => setStep("upload")}
                  style={{ padding: '10px 20px' }}
                  className="h-auto"
                >
                  Back
                </Button>
                <Button 
                  onClick={validateData}
                  disabled={!fieldMapping.name}
                  style={{ padding: '10px 20px' }}
                  className="h-auto gap-2"
                >
                  <span>Validate & Preview</span>
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* Step 3: Preview */}
          <TabsContent value="preview" className="flex-1 flex flex-col min-h-0">
            <div className="py-4 flex flex-col flex-1 min-h-0">
              <div className="flex items-center gap-4 mb-4 shrink-0">
                <Badge variant="default" className="gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  {validCount} valid
                </Badge>
                {errorCount > 0 && (
                  <Badge variant="destructive" className="gap-1">
                    <X className="w-3 h-3" />
                    {errorCount} errors
                  </Badge>
                )}
                {warningCount > 0 && (
                  <Badge variant="secondary" className="gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {warningCount} warnings
                  </Badge>
                )}
              </div>

              <div className="flex-1 min-h-0 border rounded-lg overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Row</TableHead>
                      <TableHead className="w-20">Status</TableHead>
<TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>District</TableHead>
                        <TableHead>Issues</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedRows.slice(0, 100).map(row => (
                      <TableRow 
                        key={row.rowIndex}
                        className={row.errors.length > 0 ? "bg-destructive/10" : row.warnings.length > 0 ? "bg-warning/10" : ""}
                      >
                        <TableCell className="font-mono text-xs">{row.rowIndex}</TableCell>
                        <TableCell>
                          {row.errors.length > 0 ? (
                            <X className="w-4 h-4 text-destructive" />
                          ) : row.warnings.length > 0 ? (
                            <AlertCircle className="w-4 h-4 text-warning" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4 text-success" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{row.data.name || "-"}</TableCell>
                        <TableCell className="text-muted-foreground">{row.data.email || "-"}</TableCell>
                        <TableCell className="text-muted-foreground">{row.data.jurisdiction || "-"}</TableCell>
                        <TableCell>
                          {row.errors.length > 0 && (
                            <span className="text-xs text-destructive">{row.errors.join(", ")}</span>
                          )}
                          {row.warnings.length > 0 && (
                            <span className="text-xs text-warning">{row.warnings.join(", ")}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {parsedRows.length > 100 && (
<div className="p-4 text-center text-sm text-muted-foreground">
                    Showing first 100 rows of {parsedRows.length}
                  </div>
                )}
              </div>

              <div className="flex justify-between pt-4 border-t mt-4 shrink-0" style={{ borderColor: 'var(--border-primary)' }}>
                <Button 
                  variant="outline" 
                  onClick={() => setStep("map")}
                  style={{ padding: '10px 20px' }}
                  className="h-auto"
                >
                  Back
                </Button>
                <Button 
                  onClick={handleImport}
                  disabled={validCount === 0 || isPending}
                  style={{ padding: '10px 20px' }}
                  className="h-auto gap-2"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Importing...</span>
                    </>
                  ) : (
                    <>
                      <span>Import {validCount} Contacts</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* Step 4: Result */}
          <TabsContent value="result" className="flex-1 overflow-auto">
            {importResult && (
              <div className="space-y-6 py-8">
                <div className="text-center">
                  {importResult.success > 0 ? (
                    <CheckCircle2 className="w-16 h-16 mx-auto text-success mb-4" />
                  ) : (
                    <AlertCircle className="w-16 h-16 mx-auto text-destructive mb-4" />
                  )}
                  <h3 className="text-2xl font-bold">
                    {importResult.success > 0 ? "Import Complete!" : "Import Failed"}
                  </h3>
                  <p className="text-muted-foreground mt-2">
                    {importResult.success} contacts imported successfully
                    {importResult.failed > 0 && `, ${importResult.failed} failed`}
                  </p>
                </div>

                {importResult.errors.length > 0 && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      <ul className="list-disc list-inside">
                        {importResult.errors.slice(0, 5).map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}

                <div className="flex justify-center gap-4">
                  <Button 
                    variant="outline" 
                    onClick={handleReset}
                    style={{ padding: '10px 20px' }}
                    className="h-auto"
                  >
                    Import More
                  </Button>
                  <Button 
                    onClick={() => setOpen(false)}
                    style={{ padding: '10px 20px' }}
                    className="h-auto"
                  >
                    Done
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
