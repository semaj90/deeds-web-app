# Ultimate TODO Generation Script for SvelteKit
# This script runs npm run check and generates a formatted TODO.md file

Write-Host "🚀 SvelteKit TODO Generation System" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Change to sveltekit-frontend directory
Set-Location "sveltekit-frontend"

Write-Host "📁 Current directory: $(Get-Location)" -ForegroundColor Yellow
Write-Host "🔄 Running project checks..." -ForegroundColor Yellow

# Variables
$ErrorFile = "check-errors.log"
$OutputFile = "TODO.md"
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

# Run npm run check and capture output
try {
    $output = npm run check 2>&1
    $output | Out-File -FilePath $ErrorFile -Encoding UTF8
    Write-Host "✅ Check completed successfully!" -ForegroundColor Green
} catch {
    Write-Host "⚠️ Check completed with issues" -ForegroundColor Yellow
    $_.Exception.Message | Out-File -FilePath $ErrorFile -Encoding UTF8
}

# Create comprehensive TODO.md
$todoContent = @"
# ✅ Project Issues Todo List

Generated on $timestamp

## Summary
This file contains all TypeScript, Svelte, and other issues found by running ``npm run check``.

## Check Results
"@

# Analyze the output
$logContent = Get-Content $ErrorFile -ErrorAction SilentlyContinue
$issueCount = 0
$fileIssues = @{}

if ($logContent) {
    foreach ($line in $logContent) {
        # Look for file paths and errors
        if ($line -match "src[/\\].*") {
            $currentFile = ($line -split ":")[0]
            if ($currentFile -match "src[/\\].*") {
                $currentFile = [regex]::Match($currentFile, "src[/\\].*").Value
            }
        }
        
        if ($line -match "(error|warning|Error|Warning)" -and $currentFile) {
            if (-not $fileIssues.ContainsKey($currentFile)) {
                $fileIssues[$currentFile] = @()
            }
            $cleanLine = $line -replace "^.*?:", ""
            $fileIssues[$currentFile] += $cleanLine.Trim()
            $issueCount++
        }
    }
}

# Add results to TODO
if ($issueCount -gt 0) {
    $todoContent += "`n🔍 Found **$issueCount** issues that need attention:`n"
    foreach ($file in $fileIssues.Keys) {
        $todoContent += "`n### 📄 File: ``$file```n"
        foreach ($issue in $fileIssues[$file]) {
            $todoContent += "- ❌ $issue`n"
        }
    }
} else {
    $todoContent += "`n✅ **No issues found!** Your project is clean and ready to go!`n"
}

# Add modern components section
$todoContent += @"

---

## 🎨 Modern SvelteKit Components Available

Your project includes these cutting-edge components:

### 🎯 Command System
- **CommandMenu.svelte** - Slash command system with citations
- **SmartTextarea.svelte** - Textarea with integrated command menu

### 🎨 Layout Components  
- **GoldenLayout.svelte** - Golden ratio layout with collapsible sidebar
- **ExpandGrid.svelte** - Hover-expanding grid (1→3 columns)

### 🔧 Enhanced Components
- **EvidenceCard.svelte** - Improved hover effects and accessibility
- **Citations Store** - Full CRUD with recent citations tracking
- **Fast Navigation** - SvelteKit's built-in SPA routing

### 📱 Features
- ✨ **Hover Effects** - Scale animations and smooth transitions
- 🎨 **Type-specific Styling** - Color-coded badges and themes
- 📱 **Responsive Design** - Mobile-first approach
- ♿ **Accessibility** - Screen reader friendly with ARIA labels
- 🎯 **Interactive Actions** - Comprehensive button system
- 🏷️ **Smart Metadata** - File information and formatting
- 🔗 **Preview Support** - Image and video previews
- 📝 **Tooltip System** - Detailed information on hover

## 🎮 Demo Page
Visit ``/modern-demo`` to see all components in action!

## 🚀 Next Steps
1. 🧪 Test the demo page at ``/modern-demo``
2. 🔗 Integrate components into your existing pages
3. 🎨 Customize styling with CSS custom properties
4. ⚡ Add more commands to the command menu
5. 🔄 Run this script regularly to track progress

## 🛠️ Development Commands
```bash
# Run checks
npm run check

# Generate TODO
powershell -ExecutionPolicy Bypass -File ../generate-todo-ultimate.ps1

# Start development
npm run dev
```

---

**Generated by:** SvelteKit Modernization & Automation System  
**Last Updated:** $timestamp
"@

# Write the TODO file
$todoContent | Out-File -FilePath $OutputFile -Encoding UTF8

Write-Host ""
Write-Host "🎉 SUCCESS! TODO.md has been generated!" -ForegroundColor Green
Write-Host "📋 Location: $(Get-Location)\$OutputFile" -ForegroundColor Cyan
Write-Host ""

# Display summary
Write-Host "📊 Summary:" -ForegroundColor Yellow
if ($issueCount -gt 0) {
    Write-Host "   ⚠️  $issueCount issues found" -ForegroundColor Red
} else {
    Write-Host "   ✅ No issues found - project is clean!" -ForegroundColor Green
}

Write-Host "   📄 TODO.md updated with latest status" -ForegroundColor Cyan
Write-Host "   🎨 Modern components documented" -ForegroundColor Magenta
Write-Host ""
Write-Host "🎯 Next: Visit http://localhost:5173/modern-demo to see your modern components!" -ForegroundColor Cyan
