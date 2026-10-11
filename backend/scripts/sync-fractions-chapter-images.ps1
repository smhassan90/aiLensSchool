# Copy teacher-upload chapter photos from Cursor assets into test-fixtures.
$assets = "C:\Users\User\.cursor\projects\d-workspace-aiLensSchool-aiLensSchool\assets"
$dest = Join-Path $PSScriptRoot "..\test-fixtures\fractions-chapter-calibration"
New-Item -ItemType Directory -Force -Path $dest | Out-Null

$map = @{
  "ch03-opener.jpg"      = "c__Users_User_AppData_Roaming_Cursor_User_workspaceStorage_1174750180b1ba55948f9b3721f58d47_images_1-eab03d81-f363-43a6-b1c5-1ead8796ca4d.jpg"
  "p39-reduce.jpg"       = "c__Users_User_AppData_Roaming_Cursor_User_workspaceStorage_1174750180b1ba55948f9b3721f58d47_images_2-ac2857fa-7102-4faf-bc57-e73940c416c0.jpg"
  "p40-add.jpg"          = "c__Users_User_AppData_Roaming_Cursor_User_workspaceStorage_1174750180b1ba55948f9b3721f58d47_images_3-4bedb1d2-dadb-4781-8ebf-889bafd0e256.jpg"
  "p43-mult-whole.jpg"   = "c__Users_User_AppData_Roaming_Cursor_User_workspaceStorage_1174750180b1ba55948f9b3721f58d47_images_6-549c6370-8837-46e5-947f-5594319219b7.jpg"
  "p44-mult-frac.jpg"    = "c__Users_User_AppData_Roaming_Cursor_User_workspaceStorage_1174750180b1ba55948f9b3721f58d47_images_7-c293dc74-367a-41d0-b728-f2a442a953ca.jpg"
  "p45-mixed.jpg"        = "c__Users_User_AppData_Roaming_Cursor_User_workspaceStorage_1174750180b1ba55948f9b3721f58d47_images_8-59cc412d-d1d2-4c40-99ac-8e414c4ae64a.jpg"
  "p46-brackets.jpg"     = "c__Users_User_AppData_Roaming_Cursor_User_workspaceStorage_1174750180b1ba55948f9b3721f58d47_images_9-577f901f-2682-4f7b-82db-f115e541edb1.jpg"
  "p47-exercise-3b.jpg"  = "c__Users_User_AppData_Roaming_Cursor_User_workspaceStorage_1174750180b1ba55948f9b3721f58d47_images_14-ce4f334e-ade0-44f6-b0cf-07a8a2d6ee6f.jpg"
  "p48-grid.jpg"         = "c__Users_User_AppData_Roaming_Cursor_User_workspaceStorage_1174750180b1ba55948f9b3721f58d47_images_10-8ed5c3fe-0171-4ff4-b3f9-21c5f6a6eb94.jpg"
  "p49-mult-grid.jpg"    = "c__Users_User_AppData_Roaming_Cursor_User_workspaceStorage_1174750180b1ba55948f9b3721f58d47_images_12-5257d706-ffa8-41dd-a446-744dccd6c431.jpg"
  "p50-story.jpg"        = "c__Users_User_AppData_Roaming_Cursor_User_workspaceStorage_1174750180b1ba55948f9b3721f58d47_images_16-a1039e71-9fa5-4e18-864f-291f6c8a520c.jpg"
  "p51-division.jpg"     = "c__Users_User_AppData_Roaming_Cursor_User_workspaceStorage_1174750180b1ba55948f9b3721f58d47_images_13-59147e23-cdf0-48e3-b973-a79ced33cdc1.jpg"
  "p52-rules.jpg"        = "c__Users_User_AppData_Roaming_Cursor_User_workspaceStorage_1174750180b1ba55948f9b3721f58d47_images_4-f13a167c-a08a-44b9-b976-52e59f9cb9a2.jpg"
  "p53-divide-1.jpg"     = "c__Users_User_AppData_Roaming_Cursor_User_workspaceStorage_1174750180b1ba55948f9b3721f58d47_images_17-61e6aa33-9e1c-45cf-9947-31f75064f8d5.jpg"
  "p54-divide-frac.jpg"  = "c__Users_User_AppData_Roaming_Cursor_User_workspaceStorage_1174750180b1ba55948f9b3721f58d47_images_18-1735d9ad-5ee0-47c1-8e3f-314e8f0ccbca.jpg"
  "p55-exercise-3c.jpg"  = "c__Users_User_AppData_Roaming_Cursor_User_workspaceStorage_1174750180b1ba55948f9b3721f58d47_images_15-42366e7d-8434-48f0-9c96-59f6c95f15e0.jpg"
  "p56-divide-grid.jpg"  = "c__Users_User_AppData_Roaming_Cursor_User_workspaceStorage_1174750180b1ba55948f9b3721f58d47_images_19-f255e75c-1ff8-4ad4-b295-cc0e7d006050.jpg"
  "p57-divide-grid.jpg"  = "c__Users_User_AppData_Roaming_Cursor_User_workspaceStorage_1174750180b1ba55948f9b3721f58d47_images_20-69b3d0a1-4acd-4b7c-b164-2ebe565eaea5.jpg"
}

foreach ($entry in $map.GetEnumerator()) {
  $src = Join-Path $assets $entry.Value
  $out = Join-Path $dest $entry.Key
  if (-not (Test-Path $src)) {
    Write-Warning "Missing source: $($entry.Value)"
    continue
  }
  Copy-Item -Force $src $out
  Write-Host "Copied $($entry.Key)"
}
