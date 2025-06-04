'use client'

import { ClerkProvider } from '@clerk/nextjs'

export function ClerkWrapper({
  children,
  publishableKey,
}: {
  children: React.ReactNode
  publishableKey: string
}) {
  return (
    <ClerkProvider
      publishableKey={publishableKey}
      appearance={{
        elements: {
          formButtonPrimary: 'bg-[#A2BD9D] hover:bg-[#8FA889]',
        },
      }}
    >
      {children}
    </ClerkProvider>
  )
}
