// Sample contact for template preview
export const sampleContact = {
  id: "sample",
  name: "John Smith",
  title: "Director",
  organization: "City Department",
  department: "Public Works",
  email: "john.smith@example.gov",
  phone: "(555) 123-4567",
  jurisdiction: "D5",
  priority: 3,
  status: "active" as const,
  notes: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}
