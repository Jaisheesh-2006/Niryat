PS C:\Users\Balagowni Jaisheesh\Desktop\Projects\Niryat> git add .
PS C:\Users\Balagowni Jaisheesh\Desktop\Projects\Niryat> git commit -sm "feat: Adds F3’s icons, shared display components, error fallback and tests. The approved CSS gives BrandMark its primary square and saffron arrow."
╭─────────────────────────────────────────╮
│ 🥊 lefthook  v2.2.2   hook:  pre-commit │
╰─────────────────────────────────────────╯
⠋ waiting: biomeapps\web\src\app\globals.css:749:1 lint/style/noDescendingSpecificity ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ! Descending specificity selector found. This selector specificity is (0, 1, 0)
  
    747 │   --niryat-event-color: var(--niryat-upcoming);
⠙ waiting: biome  748 │ }
  > 749 │ .niryat-past {
        │ ^^^^^^^^^^^^
    750 │   color: var(--niryat-past);
    751 │   --niryat-event-color: var(--niryat-past);
  
  i This selector specificity is (0, 2, 0)
  
⠹ waiting: biome n: 0;
    737 │ }
  > 738 │ .calendar-legend .niryat-past {
        │ ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    739 │   color: var(--niryat-muted);
    740 │ }
  
  i Descending specificity selector may not be applied. Consider rearranging the order of the selectors.See MDN web docs for more details.
  
