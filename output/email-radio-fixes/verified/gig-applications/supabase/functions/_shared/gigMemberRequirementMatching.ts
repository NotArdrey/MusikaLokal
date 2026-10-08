export type GigRosterMember = {
    member_id: string
    member_name: string
    roles: string[]
    instruments: string[]
}

export type GigMemberRequirementCoverageItem = {
    requirement_label: string
    required_roles: string[]
    required_instruments: string[]
    status: 'confirmed' | 'unmatched'
    member_id: string | null
    member_name: string | null
    member_roles: string[]
    member_instruments: string[]
}

export type GigMemberRequirementCoverage = {
    slot_id: string
    slot_label: string
    matched_count: number
    total_count: number
    coverage_ratio: number
    members: GigMemberRequirementCoverageItem[]
}

const uniqueStrings = (values: unknown[]): string[] => Array.from(new Set(
    values
        .flatMap((value) => Array.isArray(value) ? value : [value])
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean)
))

const canonicalMusicValue = (value: unknown) => {
    const normalized = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

    const aliases: Array<[RegExp, string]> = [
        [/\blead\s+vocals?\b|\bvocalists?\b|\bsingers?\b/g, ' vocals '],
        [/\bguitarists?\b/g, ' guitar '],
        [/\bbassists?\b/g, ' bass '],
        [/\bdrummers?\b/g, ' drums '],
        [/\bkeyboardists?\b/g, ' keyboard '],
        [/\bpianists?\b/g, ' piano '],
        [/\bviolinists?\b/g, ' violin '],
    ]

    return aliases
        .reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), normalized)
        .replace(/\s+/g, ' ')
        .trim()
}

const valuesOverlap = (expected: string[], actual: string[]) => {
    const normalizedActual = actual.map(canonicalMusicValue).filter(Boolean)
    return expected.some((expectedValue) => {
        const normalizedExpected = canonicalMusicValue(expectedValue)
        if (!normalizedExpected) return false
        return normalizedActual.some((actualValue) =>
            actualValue === normalizedExpected ||
            ` ${actualValue} `.includes(` ${normalizedExpected} `) ||
            ` ${normalizedExpected} `.includes(` ${actualValue} `)
        )
    })
}

export function normalizeGigRosterMembers(value: unknown): GigRosterMember[] {
    if (!Array.isArray(value)) return []

    return value.map((rawMember, index) => {
        if (typeof rawMember === 'string') {
            return {
                member_id: `member-${index + 1}`,
                member_name: rawMember.trim() || `Member ${index + 1}`,
                roles: [],
                instruments: [],
            }
        }

        const member = rawMember && typeof rawMember === 'object'
            ? rawMember as Record<string, unknown>
            : {}
        const memberId = String(member.user_id || member.id || `member-${index + 1}`)
        const memberName = String(
            member.member_name || member.name || member.display_name || member.full_name || `Member ${index + 1}`
        ).trim()

        return {
            member_id: memberId,
            member_name: memberName || `Member ${index + 1}`,
            roles: uniqueStrings([member.member_role, member.role, member.roles, member.musician_roles]),
            instruments: uniqueStrings([member.instrument, member.instruments, member.skills]),
        }
    })
}

type NormalizedRequirement = {
    label: string
    roles: string[]
    instruments: string[]
}

const normalizeMemberRequirements = (value: unknown): NormalizedRequirement[] => {
    if (!Array.isArray(value)) return []
    return value.flatMap((rawRequirement, index) => {
        if (!rawRequirement || typeof rawRequirement !== 'object') return []
        const requirement = rawRequirement as Record<string, unknown>
        const roles = uniqueStrings([requirement.roles, requirement.required_roles])
        const instruments = uniqueStrings([
            requirement.instruments,
            requirement.preferred_instruments,
            requirement.required_instruments,
        ])
        if (roles.length === 0 && instruments.length === 0) return []
        return [{
            label: String(requirement.label || `Member ${index + 1}`).trim() || `Member ${index + 1}`,
            roles,
            instruments,
        }]
    })
}

const memberSatisfiesRequirement = (member: GigRosterMember, requirement: NormalizedRequirement) => {
    const memberValues = [...member.roles, ...member.instruments]
    const roleMatches = requirement.roles.length === 0 || valuesOverlap(requirement.roles, memberValues)
    const instrumentMatches = requirement.instruments.length === 0 || valuesOverlap(requirement.instruments, memberValues)
    return roleMatches && instrumentMatches
}

const assignDistinctMembers = (
    requirements: NormalizedRequirement[],
    rosterMembers: GigRosterMember[],
) => {
    const compatibleMemberIndexes = requirements.map((requirement) => rosterMembers
        .map((member, memberIndex) => memberSatisfiesRequirement(member, requirement) ? memberIndex : -1)
        .filter((memberIndex) => memberIndex >= 0))
    const memberAssignments = Array<number | null>(rosterMembers.length).fill(null)

    const assignRequirement = (requirementIndex: number, visitedMembers: Set<number>): boolean => {
        for (const memberIndex of compatibleMemberIndexes[requirementIndex]) {
            if (visitedMembers.has(memberIndex)) continue
            visitedMembers.add(memberIndex)
            const previousRequirement = memberAssignments[memberIndex]
            if (previousRequirement === null || assignRequirement(previousRequirement, visitedMembers)) {
                memberAssignments[memberIndex] = requirementIndex
                return true
            }
        }
        return false
    }

    requirements.forEach((_, requirementIndex) => {
        assignRequirement(requirementIndex, new Set<number>())
    })

    const requirementAssignments = Array<number | null>(requirements.length).fill(null)
    memberAssignments.forEach((requirementIndex, memberIndex) => {
        if (requirementIndex !== null) requirementAssignments[requirementIndex] = memberIndex
    })
    return requirementAssignments
}

export function matchGigMemberRequirements(
    specificRequirements: unknown,
    rosterMembersValue: unknown,
    groupType = '',
): GigMemberRequirementCoverage | null {
    if (!Array.isArray(specificRequirements)) return null
    const rosterMembers = normalizeGigRosterMembers(rosterMembersValue)
    const normalizedGroupType = String(groupType || '').trim().toLowerCase()
    const broadGroupType = (value: string) => {
        if (value === 'duo' || value === 'acoustic_duo') return 'duo'
        return value ? 'band' : ''
    }
    const candidates = specificRequirements.flatMap((rawSlot, slotIndex) => {
        if (!rawSlot || typeof rawSlot !== 'object') return []
        const slot = rawSlot as Record<string, unknown>
        const requiredGroupType = String(slot.group_type || '').trim().toLowerCase()
        const applicationHasSpecificGroupType = normalizedGroupType && !['duo', 'band', 'group', 'music_group'].includes(normalizedGroupType)
        if (
            requiredGroupType &&
            normalizedGroupType &&
            broadGroupType(requiredGroupType) !== broadGroupType(normalizedGroupType)
        ) return []
        if (requiredGroupType && applicationHasSpecificGroupType && requiredGroupType !== normalizedGroupType) return []
        const requirements = normalizeMemberRequirements(slot.members)
        if (requirements.length === 0) return []
        const assignments = assignDistinctMembers(requirements, rosterMembers)
        const coverage = requirements.map((requirement, requirementIndex): GigMemberRequirementCoverageItem => {
            const memberIndex = assignments[requirementIndex]
            const member = memberIndex === null ? null : rosterMembers[memberIndex]
            return {
                requirement_label: requirement.label,
                required_roles: requirement.roles,
                required_instruments: requirement.instruments,
                status: member ? 'confirmed' : 'unmatched',
                member_id: member?.member_id || null,
                member_name: member?.member_name || null,
                member_roles: member?.roles || [],
                member_instruments: member?.instruments || [],
            }
        })
        const matchedCount = coverage.filter((item) => item.status === 'confirmed').length
        return [{
            slot_id: String(slot.slot_id || `slot-${slotIndex + 1}`),
            slot_label: String(slot.label || `Slot ${slotIndex + 1}`),
            matched_count: matchedCount,
            total_count: coverage.length,
            coverage_ratio: coverage.length > 0 ? matchedCount / coverage.length : 0,
            members: coverage,
        }]
    })

    return candidates.sort((left, right) =>
        right.coverage_ratio - left.coverage_ratio ||
        right.matched_count - left.matched_count ||
        left.slot_label.localeCompare(right.slot_label)
    )[0] || null
}
