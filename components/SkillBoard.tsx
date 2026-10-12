"use client"

import { useState } from "react"
import type { Skill } from "@/lib/portfolio"

type Filter = "all" | Skill["category"]

const filters: { value: Filter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "frontend", label: "프론트엔드" },
  { value: "backend", label: "백엔드 · 보안" },
  { value: "tools", label: "도구" },
]

export function SkillBoard({ skills }: { skills: Skill[] }) {
  const [filter, setFilter] = useState<Filter>("all")
  const visibleSkills =
    filter === "all" ? skills : skills.filter((skill) => skill.category === filter)

  return (
    <div>
      <div className="filter-list" aria-label="기술 분류">
        {filters.map((item) => (
          <button
            key={item.value}
            type="button"
            className={filter === item.value ? "active" : ""}
            onClick={() => setFilter(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="skill-grid">
        {visibleSkills.map((skill) => (
          <article className="skill-card" key={skill.name}>
            <div className="skill-heading">
              <h2>{skill.name}</h2>
              <span>{skill.level}%</span>
            </div>
            <div className="skill-track" aria-label={`${skill.name} 숙련도 ${skill.level}%`}>
              <div className="skill-value" style={{ width: `${skill.level}%` }} />
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

