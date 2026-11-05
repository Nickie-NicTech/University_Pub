import re
from difflib import SequenceMatcher

from .models import ReviewerSubjectArea, ReviewerSubjectAreaExclusion


_WORD_PATTERN = re.compile(r'[a-z0-9]+')
_ENGINEERING_TYPO_PATTERN = re.compile(r'\b(?:engeneering|engeeneering)\b', re.IGNORECASE)
_WORD_MATCH_THRESHOLD = 0.78
_SUBJECT_MATCH_THRESHOLD = 0.78


def normalize_subject_area(value):
    def correct_engineering(match):
        word = match.group()
        if word.isupper():
            return 'ENGINEERING'
        return 'Engineering'

    return _ENGINEERING_TYPO_PATTERN.sub(correct_engineering, (value or '').strip())


def subject_words(value):
    return _WORD_PATTERN.findall(normalize_subject_area(value).casefold())


def _word_similarity(first, second):
    if first == second:
        return 1.0
    if min(len(first), len(second)) < 4:
        return 0.0
    ratio = SequenceMatcher(None, first, second).ratio()
    return ratio if ratio >= _WORD_MATCH_THRESHOLD else 0.0


def subject_similarity(first, second):
    first_words = subject_words(first)
    second_words = subject_words(second)
    if not first_words or not second_words:
        return 0.0
    matched = sum(
        max((_word_similarity(word, candidate) for candidate in second_words), default=0.0)
        for word in first_words
    )
    return matched / max(len(first_words), len(second_words))


def canonical_subject_area(subject_area):
    areas = ReviewerSubjectArea.objects.values_list('subject_area', flat=True).distinct()
    best_area = max(
        areas,
        key=lambda area: subject_similarity(subject_area, area),
        default=subject_area.strip(),
    )
    if subject_similarity(subject_area, best_area) >= _SUBJECT_MATCH_THRESHOLD:
        return normalize_subject_area(best_area)
    return normalize_subject_area(subject_area)


def rank_lecturers(subject_area, profiles):
    profiles = list(profiles)
    if not profiles:
        return []

    reviewer_ids = [profile.user_id for profile in profiles]
    mapping_areas = {}
    for mapping in ReviewerSubjectArea.objects.filter(reviewer_id__in=reviewer_ids):
        mapping_areas.setdefault(mapping.reviewer_id, []).append(mapping.subject_area)

    exclusions = {}
    for exclusion in ReviewerSubjectAreaExclusion.objects.filter(reviewer_id__in=reviewer_ids):
        exclusions.setdefault(exclusion.reviewer_id, []).append(exclusion.subject_area)

    subject_tokens = subject_words(subject_area)

    def score(profile):
        if any(
            subject_similarity(subject_area, excluded_area) >= _SUBJECT_MATCH_THRESHOLD
            for excluded_area in exclusions.get(profile.user_id, [])
        ):
            return -1.0

        skill_tokens = subject_words(profile.skillset)
        department_tokens = subject_words(profile.department)
        skills_score = sum(
            max((_word_similarity(word, skill) for skill in skill_tokens), default=0.0)
            for word in subject_tokens
        )
        department_score = sum(
            max((_word_similarity(word, department) for department in department_tokens), default=0.0)
            for word in subject_tokens
        )
        mapping_score = max(
            (
                subject_similarity(subject_area, mapped_area)
                for mapped_area in mapping_areas.get(profile.user_id, [])
            ),
            default=0.0,
        )
        return skills_score * 3 + department_score + mapping_score * 10

    ranked = sorted(
        ((score(profile), profile) for profile in profiles),
        key=lambda result: (
            -result[0],
            result[1].user.last_name.casefold(),
            result[1].user.first_name.casefold(),
            result[1].user.username.casefold(),
        ),
    )
    for match_score, profile in ranked:
        profile.is_subject_match = match_score > 0
    return [profile for match_score, profile in ranked if match_score >= 0]
