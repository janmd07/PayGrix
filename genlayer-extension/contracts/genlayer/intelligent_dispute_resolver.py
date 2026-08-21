# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

import json
import hashlib
from dataclasses import dataclass
from typing import Optional, Any

from genlayer import *


@allow_storage
@dataclass
class DisputeRecord:
    escrow_id: str
    verdict_code: u8
    reasoning_hash: str
    reasoning_summary: str
    confidence: float
    evidence_hash: str
    status: str


class IntelligentDisputeResolver(gl.Contract):
    """
    GenLayer Intelligent Contract for evaluating Escrow disputes.
    Inherits from gl.Contract per standard GenLayer SDK specifications.
    """

    VERDICT_APPROVED = 1
    VERDICT_REJECTED = 2
    VERDICT_UNDETERMINED = 3

    dispute_records: TreeMap[str, DisputeRecord]

    def __init__(self):
        pass

    def _verify_evidence_hash(self, evidence_hash: str, evidence_content: str) -> bool:
        """
        Computes canonical SHA256 hash of evidence_content and compares against evidence_hash.
        Normalizes hex prefixes ('0x') and case before comparison.
        """
        if not evidence_hash or evidence_hash in ("0x0", "0x00", "0x" + "0"*64, "0"*64):
            return True

        if not evidence_content:
            return False

        clean_target = evidence_hash.lower()
        if clean_target.startswith("0x"):
            clean_target = clean_target[2:]

        computed = hashlib.sha256(evidence_content.encode("utf-8")).hexdigest().lower()
        return computed == clean_target

    def _build_prompt(
        self,
        escrow_id: str,
        contract_terms: str,
        claimant_statement: str,
        respondent_statement: str,
        evidence_uri: str,
        evidence_content: str
    ) -> str:
        """
        Constructs a prompt with explicit security boundaries isolating untrusted user statements
        from system instructions. External evidence is treated as DATA, not instructions.
        """
        prompt = f"""
=== SYSTEM INSTRUCTIONS ===
You are an impartial digital escrow dispute adjudicator.
Evaluate the evidence and statements for the Escrow ID provided below.
Your objective is to determine if the terms of the agreement were fulfilled.

Output Requirements:
Respond ONLY with a valid JSON object with the following structure:
{{
  "verdict": 1 | 2 | 3,
  "confidence": <float between 0.0 and 1.0>,
  "reasoning_summary": "<concise explanation max 200 chars>"
}}

Verdict Key:
1 = APPROVED (Deliverable completed according to terms -> Pay Beneficiary)
2 = REJECTED (Deliverable breached or failed -> Refund Depositor)
3 = UNDETERMINED (Evidence missing, unreadable, or conflicting beyond resolution -> Fallback)

=== CONTRACT TERMS ===
{contract_terms.strip() if contract_terms else "Standard escrow agreement for task execution."}

=== CLAIMANT STATEMENT ===
{claimant_statement.strip() if claimant_statement else "No claimant statement submitted."}

=== RESPONDENT STATEMENT ===
{respondent_statement.strip() if respondent_statement else "No respondent statement submitted."}

=== EXTERNAL EVIDENCE (URI: {evidence_uri}) ===
{evidence_content.strip() if evidence_content else "No external evidence content retrieved."}
"""
        return prompt

    @gl.public.write
    def evaluate_dispute(
        self,
        escrow_id: str,
        contract_terms: str,
        claimant_statement: str,
        respondent_statement: str,
        evidence_hash: str,
        evidence_uri: str,
        evidence_content: str = ""
    ) -> dict:
        """
        Main entrypoint for dispute evaluation exposed as a public write method.
        Strictly verifies evidence hash before any LLM evaluation.
        If hash verification fails, immediately returns VERDICT_UNDETERMINED without invoking LLM.
        """
        if not escrow_id:
            return {
                "escrow_id": escrow_id,
                "verdict_code": self.VERDICT_UNDETERMINED,
                "reasoning_hash": "",
                "status": "ERROR_INVALID_ESCROW_ID"
            }

        # Strict Evidence Integrity Verification: LLM MUST NOT run if hash verification fails
        if evidence_hash and evidence_hash not in ("0x0", "0x00", "0x" + "0"*64, "0"*64):
            if not self._verify_evidence_hash(evidence_hash, evidence_content):
                reasoning_msg = "HASH_MISMATCH: Evidence content SHA256 does not match on-chain evidence_hash."
                return {
                    "escrow_id": escrow_id,
                    "verdict_code": self.VERDICT_UNDETERMINED,
                    "reasoning_hash": hashlib.sha256(reasoning_msg.encode('utf-8')).hexdigest(),
                    "reasoning_summary": reasoning_msg,
                    "status": "UNDETERMINED_EVIDENCE_HASH_MISMATCH"
                }

        # Fallback if required evidence URI was specified but no content & no statements
        if evidence_uri and not evidence_content and not claimant_statement and not respondent_statement:
            reasoning_msg = "MISSING_EVIDENCE: Required external evidence content could not be retrieved."
            return {
                "escrow_id": escrow_id,
                "verdict_code": self.VERDICT_UNDETERMINED,
                "reasoning_hash": hashlib.sha256(reasoning_msg.encode('utf-8')).hexdigest(),
                "reasoning_summary": reasoning_msg,
                "status": "UNDETERMINED_MISSING_EVIDENCE"
            }

        prompt = self._build_prompt(
            escrow_id=escrow_id,
            contract_terms=contract_terms,
            claimant_statement=claimant_statement,
            respondent_statement=respondent_statement,
            evidence_uri=evidence_uri,
            evidence_content=evidence_content
        )

        raw_result = self._exec_llm_with_consensus(prompt)
        
        verdict_code = raw_result.get("verdict", self.VERDICT_UNDETERMINED)
        if verdict_code not in (self.VERDICT_APPROVED, self.VERDICT_REJECTED, self.VERDICT_UNDETERMINED):
            verdict_code = self.VERDICT_UNDETERMINED

        reasoning = raw_result.get("reasoning_summary", "Adjudication completed.")
        reasoning_hash = hashlib.sha256(reasoning.encode('utf-8')).hexdigest()

        record = DisputeRecord(
            escrow_id=escrow_id,
            verdict_code=int(verdict_code),
            reasoning_hash=reasoning_hash,
            reasoning_summary=reasoning,
            confidence=float(raw_result.get("confidence", 1.0)),
            evidence_hash=evidence_hash,
            status="FINALIZED"
        )

        self.dispute_records[escrow_id] = record
        return {
            "escrow_id": escrow_id,
            "verdict_code": verdict_code,
            "reasoning_hash": reasoning_hash,
            "reasoning_summary": reasoning,
            "confidence": record.confidence,
            "evidence_hash": evidence_hash,
            "status": "FINALIZED"
        }

    def _extract_verdict_code(self, result_obj: Any) -> Optional[int]:
        """
        Extracts deterministic verdict integer (1, 2, or 3) safely from result_obj.
        Handles gl.vm.Return instances, calldata attribute containers, dictionaries, or JSON strings.
        Returns None if extraction fails or verdict is invalid.
        """
        if result_obj is None:
            return None

        # Unwrap calldata if result_obj is gl.vm.Return or object with calldata attribute
        data = getattr(result_obj, "calldata", result_obj)

        if isinstance(data, (str, bytes)):
            try:
                clean_str = data.decode("utf-8") if isinstance(data, bytes) else data
                clean_str = clean_str.replace("```json", "").replace("```", "").strip()
                data = json.loads(clean_str)
            except Exception:
                return None

        if not isinstance(data, dict):
            return None

        raw_verdict = data.get("verdict", data.get("verdict_code"))
        try:
            verdict_int = int(raw_verdict)
            if verdict_int in (self.VERDICT_APPROVED, self.VERDICT_REJECTED, self.VERDICT_UNDETERMINED):
                return verdict_int
        except (ValueError, TypeError):
            return None

        return None

    def validate_consensus(self, prompt: str, leader_result: Any) -> bool:
        """
        Substantive validator verification logic adhering to GenLayer Equivalence Principle.
        1. Safely extracts leader's structured verdict from leader_result (handling gl.vm.Return / calldata).
        2. If leader result is malformed or cannot be decoded safely, returns False (fails consensus).
        3. Independently executes the validator LLM evaluation against the same adjudication prompt.
        4. Compares ONLY deterministic verdict codes (1=APPROVED, 2=REJECTED, 3=UNDETERMINED).
        5. Does NOT compare non-deterministic reasoning text, confidence, wording, or prose.
        6. Returns True if verdicts agree, False if they disagree or fail.
        """
        try:
            leader_verdict = self._extract_verdict_code(leader_result)
            if leader_verdict is None:
                return False

            val_result = self._exec_llm_single(prompt)
            validator_verdict = self._extract_verdict_code(val_result)
            if validator_verdict is None:
                return False

            # Compare ONLY deterministic consensus field (verdict code)
            return leader_verdict == validator_verdict
        except Exception:
            return False

    def _exec_llm_single(self, prompt: str) -> dict:
        """
        Single LLM prompt execution using GenLayer gl.nondet.exec_prompt.
        Guarantees structured dict output with fallback.
        """
        try:
            if hasattr(gl, 'nondet') and hasattr(gl.nondet, 'exec_prompt'):
                res = gl.nondet.exec_prompt(prompt, response_format="json")
            elif hasattr(gl, 'exec_prompt'):
                res = gl.exec_prompt(prompt, response_format="json")
            else:
                res = None

            if isinstance(res, dict):
                return res
            if isinstance(res, (str, bytes)):
                clean_res = res.decode("utf-8") if isinstance(res, bytes) else res
                clean_res = clean_res.replace("```json", "").replace("```", "").strip()
                return json.loads(clean_res)
        except Exception:
            # Retry without response_format keyword in case of alternate SDK interface
            try:
                if hasattr(gl, 'nondet') and hasattr(gl.nondet, 'exec_prompt'):
                    res = gl.nondet.exec_prompt(prompt)
                elif hasattr(gl, 'exec_prompt'):
                    res = gl.exec_prompt(prompt)
                else:
                    res = None

                if isinstance(res, dict):
                    return res
                if isinstance(res, (str, bytes)):
                    clean_res = res.decode("utf-8") if isinstance(res, bytes) else res
                    clean_res = clean_res.replace("```json", "").replace("```", "").strip()
                    return json.loads(clean_res)
            except Exception:
                pass

        return {
            "verdict": self.VERDICT_UNDETERMINED,
            "confidence": 0.0,
            "reasoning_summary": "LLM execution failed or returned unparseable output."
        }

    def _exec_llm_with_consensus(self, prompt: str) -> dict:
        """
        Executes nondeterministic LLM evaluation via Leader function and Validator consensus verification.
        Safely unpacks gl.vm.Return or dictionary structures returned by GenVM upon consensus.
        """
        def leader_fn() -> dict:
            return self._exec_llm_single(prompt)

        def validator_fn(leader_result: Any) -> bool:
            return self.validate_consensus(prompt, leader_result)

        try:
            if hasattr(gl, 'vm') and hasattr(gl.vm, 'run_nondet_unsafe'):
                vm_return = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
                # GenVM returns a gl.vm.Return object whose calldata contains leader_fn output
                data = getattr(vm_return, "calldata", vm_return)
                if isinstance(data, (str, bytes)):
                    clean_str = data.decode("utf-8") if isinstance(data, bytes) else data
                    clean_str = clean_str.replace("```json", "").replace("```", "").strip()
                    data = json.loads(clean_str)
                if isinstance(data, dict):
                    return data
                return {
                    "verdict": self.VERDICT_UNDETERMINED,
                    "confidence": 0.0,
                    "reasoning_summary": "Consensus reached but return calldata could not be decoded."
                }
            else:
                leader_res = leader_fn()
                valid = validator_fn(leader_res)
                if not valid:
                    return {
                        "verdict": self.VERDICT_UNDETERMINED,
                        "confidence": 0.0,
                        "reasoning_summary": "Consensus validation failed (validator disagreed or malformed output)."
                    }
                return leader_res
        except Exception as e:
            return {
                "verdict": self.VERDICT_UNDETERMINED,
                "confidence": 0.0,
                "reasoning_summary": f"Consensus execution failed: {str(e)}"
            }
